// api/filter.js
// Vercel serverless function that pages through Shopify Admin API and returns filtered products.
// Required env vars: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN

const fetch = require("node-fetch");

const ADMIN_API_VERSION = "2025-01"; // update if needed
const PAGE_LIMIT = 250; // max allowed by REST

function buildAdminUrl({ vendor, productType }) {
  // Base URL with fields to reduce payload weight
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
  // Link header example contains rel="next" with page_info param
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function fetchAdminPage(url) {
  const resp = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Shopify Admin API error: ${resp.status} ${resp.statusText} - ${text}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const linkHeader = resp.headers.get("link");
  const nextPageInfo = parseNextPageInfo(linkHeader);

  return {
    products: data.products || [],
    nextPageInfo,
  };
}

function applyClientFilters(products, { title, tag }) {
  const titleLower = title ? title.toLowerCase() : null;
  const tagLower = tag ? tag.toLowerCase() : null;

  return products.filter((p) => {
    if (titleLower) {
      if (!p.title || p.title.toLowerCase().indexOf(titleLower) === -1) {
        return false;
      }
    }
    if (tagLower) {
      // p.tags is a comma-separated string typically - normalise and check
      const tagsString = (p.tags || "").toLowerCase();
      // exact match as a tag token
      const tagsArray = tagsString.split(",").map(t => t.trim());
      if (!tagsArray.includes(tagLower)) return false;
    }
    return true;
  });
}

module.exports = async function (req, res) {
  try {
    // Accept GET or POST (App Proxy often uses GET)
    const params = req.method === "POST" ? req.body : req.query;

    const vendor = params.vendor || "";
    const productType = params.productType || params.product_type || "";
    const title = params.title || "";
    const tag = params.tag || "";

    // Build initial Admin URL (vendor/product_type applied server-side)
    let adminUrl = buildAdminUrl({ vendor, productType });

    const allProducts = [];

    // Page through until no next page_info
    let nextPageInfo = null;
    let loopCount = 0;
    const MAX_PAGES = 10000; // safety cap to avoid infinite loops

    do {
      // if we have a page_info, append it instead of building the url again
      const url = nextPageInfo
        ? `${adminUrl}&page_info=${encodeURIComponent(nextPageInfo)}`
        : adminUrl;

      const { products, nextPageInfo: newPageInfo } = await fetchAdminPage(url);

      // push only minimal product fields (can be adjusted)
      for (const p of products) {
        allProducts.push({
          id: p.id,
          title: p.title,
          vendor: p.vendor,
          productType: p.product_type,
          tags: p.tags,
          handle: p.handle,
          images: (p.images || []).map(img => ({ src: img.src, alt: img.alt })),
        });
      }

      nextPageInfo = newPageInfo;
      loopCount += 1;
      // Safety break
      if (loopCount >= MAX_PAGES) break;
    } while (nextPageInfo);

    // Apply client-side filters not supported directly by Admin query (title, tag)
    const filtered = applyClientFilters(allProducts, { title, tag });

    // NOTE: Consider adding server-side pagination for the response if result set is huge.
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      count: filtered.length,
      products: filtered,
    });
  } catch (err) {
    console.error("Filter API error:", err && err.message ? err.message : err);
    const status = (err && err.status) || 500;
    res.setHeader("Content-Type", "application/json");
    res.status(status).json({ error: err.message || "Internal server error" });
  }
};
