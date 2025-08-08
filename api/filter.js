// api/filter.js
const ADMIN_API_VERSION = "2025-01";
const PAGE_LIMIT = 250; // max per request

async function fetchFn(url, options) {
  const fetch = (await import("node-fetch")).default;
  return fetch(url, options);
}

function buildAdminUrl({ vendor, productType }) {
  const baseFields = [
    "id",
    "title",
    "vendor",
    "product_type",
    "tags",
    "handle",
    "images",
  ].join(",");

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

function applyClientFilters(products, { title, tag }) {
  const titleLower = title?.toLowerCase() || null;
  const tagLower = tag?.toLowerCase() || null;

  return products.filter((p) => {
    if (titleLower && !p.title?.toLowerCase().includes(titleLower)) return false;
    if (tagLower) {
      const tagsArray = (p.tags || "").toLowerCase().split(",").map(t => t.trim());
      if (!tagsArray.includes(tagLower)) return false;
    }
    return true;
  });
}

module.exports = async (req, res) => {
  try {
    const params = req.method === "POST" ? req.body : req.query;
    const vendor = params.vendor || "";
    const productType = params.productType || params.product_type || "";
    const title = params.title || "";
    const tag = params.tag || "";

    let adminUrl = buildAdminUrl({ vendor, productType });
    let nextPageInfo = null;
    const allProducts = [];
    let loopCount = 0;

    do {
      const url = nextPageInfo
        ? `${adminUrl}&page_info=${encodeURIComponent(nextPageInfo)}`
        : adminUrl;

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
        });
      });

      nextPageInfo = newPageInfo;
      loopCount++;
    } while (nextPageInfo && loopCount < 10000);

    const filtered = applyClientFilters(allProducts, { title, tag });

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
