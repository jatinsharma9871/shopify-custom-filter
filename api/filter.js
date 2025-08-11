// /api/filter.js — Hybrid JSON + HTML rendering with Shopify Facets
const ADMIN_API_VERSION = "2025-01";
const PAGE_LIMIT = 250;
const CACHE_TTL = 60 * 1000;

const cache = new Map();
async function fetchFn(url, options) {
  const fetch = (await import("node-fetch")).default;
  return fetch(url, options);
}

const baseFields = [
  "id", "title", "vendor", "product_type",
  "tags", "handle", "images", "variants"
].join(",");

function buildAdminUrl({ vendor, productType }) {
  let url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/products.json?limit=${PAGE_LIMIT}&fields=${encodeURIComponent(baseFields)}`;
  if (vendor) url += `&vendor=${encodeURIComponent(vendor)}`;
  if (productType) url += `&product_type=${encodeURIComponent(productType)}`;
  return url;
}

function parseNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function fetchAdminPage(url) {
  while (true) {
    const resp = await fetchFn(url, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 600));
      continue;
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Shopify Admin API error: ${resp.status} ${resp.statusText} - ${text}`);
    }

    const data = await resp.json();
    const nextPageInfo = parseNextPageInfo(resp.headers.get("link"));
    return { products: data.products || [], nextPageInfo };
  }
}

function applyClientFilters(products, { title, tag, priceMin, priceMax, size }) {
  const titleLower = title?.toLowerCase() || null;
  const tagLower = tag?.toLowerCase() || null;

  return products.filter((p) => {
    if (titleLower && !p.title?.toLowerCase().includes(titleLower)) return false;
    if (tagLower) {
      const tagsArray = (p.tags || "").toLowerCase().split(",").map(t => t.trim());
      if (!tagsArray.includes(tagLower)) return false;
    }
    if (priceMin != null || priceMax != null) {
      const prices = p.variants?.map(v => parseFloat(v.price)) || [];
      if (!prices.length) return false;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      if (priceMin != null && maxPrice < priceMin) return false;
      if (priceMax != null && minPrice > priceMax) return false;
    }
    if (size) {
      const hasSize = p.variants?.some(v =>
        v.option1?.toLowerCase() === size.toLowerCase() ||
        v.option2?.toLowerCase() === size.toLowerCase() ||
        v.option3?.toLowerCase() === size.toLowerCase()
      );
      if (!hasSize) return false;
    }
    return true;
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://thesverve.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const params = req.method === "POST" ? req.body : req.query;
    const { vendor = "", productType = "", title = "", tag = "" } = params;
    const priceMin = params.price_min ? parseFloat(params.price_min) : null;
    const priceMax = params.price_max ? parseFloat(params.price_max) : null;
    const size = params["filter.v.option.size"] || null;
    const cacheKey = JSON.stringify({ vendor, productType, title, tag, priceMin, priceMax, size });

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.status(200).send(cached.data);
      return;
    }

    let allProducts = [];
    let nextPageInfo = null;

    do {
      let url = nextPageInfo
        ? `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/products.json?limit=${PAGE_LIMIT}&fields=${encodeURIComponent(baseFields)}&page_info=${encodeURIComponent(nextPageInfo)}`
        : buildAdminUrl({ vendor, productType });

      const { products, nextPageInfo: newPageInfo } = await fetchAdminPage(url);
      allProducts.push(...products);
      if (allProducts.length >= 2000) break;
      nextPageInfo = newPageInfo;
    } while (nextPageInfo);

    const filtered = applyClientFilters(allProducts, { title, tag, priceMin, priceMax, size });

    // Get product handles to re-render using Shopify Facets HTML
    const handles = filtered.map(p => p.handle);
    const sectionUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/collections/all?section_id=main-collection-product-grid&q=${handles.join(',')}`;
    const htmlRes = await fetchFn(sectionUrl);
    const html = await htmlRes.text();

    cache.set(cacheKey, { timestamp: Date.now(), data: html });
    res.status(200).send(html);
  } catch (err) {
    console.error("Filter API error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};
