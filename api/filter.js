const ADMIN_API_VERSION = "2025-01";
const PAGE_LIMIT = 250; // Max per Admin REST API request

// Dynamic import for node-fetch (ESM)
async function fetchFn(url, options) {
  const fetch = (await import("node-fetch")).default;
  return fetch(url, options);
}

const baseFields = [
  "id",
  "title",
  "vendor",
  "product_type",
  "tags",
  "handle",
  "images",
  "variants"
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
  const resp = await fetchFn(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Shopify Admin API error: ${resp.status} ${resp.statusText} - ${text}`);
  }

  const data = await resp.json();
  const nextPageInfo = parseNextPageInfo(resp.headers.get("link"));
  return { products: data.products || [], nextPageInfo };
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const params = req.method === "POST" ? req.body : req.query;

    // Map Shopify widget params to our internal vars
    const vendor = params.vendor || "";
    const productType = params.productType || params.product_type || "";
    const title = params.title || "";
    const tag = params.tag || "";
    const priceMin = params.price_min != null
      ? parseFloat(params.price_min)
      : (params["filter.v.price.gte"] != null ? parseFloat(params["filter.v.price.gte"]) : null);
    const priceMax = params.price_max != null
      ? parseFloat(params.price_max)
      : (params["filter.v.price.lte"] != null ? parseFloat(params["filter.v.price.lte"]) : null);
    const size = params["filter.v.option.size"] || null;

    // Handle meta_only branch
    if (params.meta_only) {
      let allProducts = [];
      let nextPageInfo = null;
      let loopCount = 0;

      do {
        let url = buildAdminUrl({});
        if (nextPageInfo) {
          url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/products.json?limit=${PAGE_LIMIT}&fields=${encodeURIComponent(baseFields)}&page_info=${encodeURIComponent(nextPageInfo)}`;
        }
        const { products, nextPageInfo: newPageInfo } = await fetchAdminPage(url);
        allProducts.push(...products);
        nextPageInfo = newPageInfo;
        loopCount++;
      } while (nextPageInfo && loopCount < 50); // Limit pages for meta fetch

      const vendors = [...new Set(allProducts.map(p => p.vendor).filter(Boolean))];
      const priceValues = [];
      const colors = new Set();

      allProducts.forEach(p => {
        if (p.variants) {
          p.variants.forEach(v => {
            if (v.price) priceValues.push(parseFloat(v.price));
          });
        }
        (p.tags || "").split(",").forEach(tag => {
          const t = tag.trim();
          if (/^color:/i.test(t)) colors.add(t.replace(/^color:/i, "").trim());
        });
      });

      const priceMinMeta = Math.min(...priceValues);
      const priceMaxMeta = Math.max(...priceValues);

      res.status(200).json({
        price_min: priceMinMeta,
        price_max: priceMaxMeta,
        vendors,
        colors: Array.from(colors),
      });
      return;
    }

    // Fetch all products with paging
    const allProducts = [];
    let nextPageInfo = null;
    let loopCount = 0;

    do {
      let url;
      if (nextPageInfo) {
        url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/products.json?limit=${PAGE_LIMIT}&fields=${encodeURIComponent(baseFields)}&page_info=${encodeURIComponent(nextPageInfo)}`;
      } else {
        url = buildAdminUrl({ vendor, productType });
      }

      const { products, nextPageInfo: newPageInfo } = await fetchAdminPage(url);

      products.forEach(p => {
        allProducts.push({
          id: p.id,
          title: p.title,
          vendor: p.vendor,
          productType: p.product_type,
          tags: p.tags,
          handle: p.handle,
          images: (p.images || []).map(img => ({ src: img.src, alt: img.alt })),
          variants: p.variants || []
        });
      });

      nextPageInfo = newPageInfo;
      loopCount++;
    } while (nextPageInfo && loopCount < 10000);

    // Apply client filters
    const filtered = applyClientFilters(allProducts, { title, tag, priceMin, priceMax, size });

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      count: filtered.length,
      products: filtered,
    });
  } catch (err) {
    console.error("Filter API error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};
