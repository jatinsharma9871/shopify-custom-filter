const ADMIN_API_VERSION = "2025-01";
const PAGE_LIMIT = 250;
const CACHE_TTL = 60 * 1000; // 1 min cache
const MAX_PAGES = 50; // max pages to fetch
const SECTION_ID = "main-collection-product-grid"; // Minimog main grid section

const cache = new Map();

async function fetchFn(url, options) {
  const fetch = (await import("node-fetch")).default;
  return fetch(url, options);
}

const baseFields = [
  "id", "title", "vendor", "product_type", "tags", "handle", "images", "variants"
].join(",");

// REST URL builder
function buildAdminUrl({ vendor, productType }) {
  let url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/products.json?limit=${PAGE_LIMIT}&fields=${encodeURIComponent(baseFields)}`;
  if (vendor) url += `&vendor=${encodeURIComponent(vendor)}`;
  if (productType) url += `&product_type=${encodeURIComponent(productType)}`;
  return url;
}

// Optional: GraphQL query builder example (currently unused)
function buildGraphQLQuery({ vendor, productType, cursor }) {
  return {
    query: `
      query ($first: Int!, $vendor: String, $productType: String, $after: String) {
        products(first: $first, after: $after, query: ${vendor || productType ? '""' : '""'}) {
          edges {
            cursor
            node {
              id
              title
              vendor
              productType
              tags
              handle
              images(first: 5) {
                edges {
                  node {
                    src
                    altText
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    price
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `,
    variables: { first: PAGE_LIMIT, vendor, productType, after: cursor }
  };
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
      const prices = p.variants?.map(v => parseFloat(v.price)).filter(v => !isNaN(v)) || [];
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

// Fetch Minimog section HTML from storefront for updated product grid UI
async function fetchSectionHTML(params) {
  const query = new URLSearchParams(params).toString();
  const storefrontURL = `https://${process.env.SHOPIFY_STORE_DOMAIN}/collections/${params.collectionHandle}?section_id=${SECTION_ID}&${query}`;
  const resp = await fetchFn(storefrontURL, { method: "GET" });
  if (!resp.ok) {
    throw new Error(`Storefront HTML fetch failed: ${resp.status}`);
  }
  return await resp.text();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://c4c4szrpl7ofukt0-56868241501.shopifypreview.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SHOPIFY_STORE_DOMAIN || !process.env.SHOPIFY_ADMIN_TOKEN) {
    return res.status(500).json({ error: "Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_TOKEN env vars" });
  }

  try {
    const params = req.method === "POST" ? req.body : req.query;

    const vendor = params.vendor || "";
    const productType = params.productType || params.product_type || "";
    const title = params.title || "";
    const tag = params.tag || "";
    const priceMin = parseFloat(params.price_min ?? params["filter.v.price.gte"]) || null;
    const priceMax = parseFloat(params.price_max ?? params["filter.v.price.lte"]) || null;
    const size = params["filter.v.option.size"] || null;
    const collectionHandle = params.collectionHandle || "all";

    const cacheKey = JSON.stringify({ vendor, productType, title, tag, priceMin, priceMax, size, collectionHandle });
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return res.status(200).json(cached.data);
    }

    // Fetch products from Admin API (REST)
    const allProducts = [];
    let nextPageInfo = null;
    let pageCount = 0;

    do {
      const url = nextPageInfo
        ? `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/products.json?limit=${PAGE_LIMIT}&fields=${encodeURIComponent(baseFields)}&page_info=${encodeURIComponent(nextPageInfo)}`
        : buildAdminUrl({ vendor, productType });

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

      if (++pageCount >= MAX_PAGES || allProducts.length >= 5000) break;
      nextPageInfo = newPageInfo;
    } while (nextPageInfo);

    // Apply additional client-side filters
    const filtered = applyClientFilters(allProducts, { title, tag, priceMin, priceMax, size });

    // Fetch Minimog section HTML to render filtered product grid
    const html = await fetchSectionHTML({ ...params, collectionHandle });

    // Cache & respond
    const responseData = { count: filtered.length, products: filtered, html };
    cache.set(cacheKey, { timestamp: Date.now(), data: responseData });

    res.status(200).json(responseData);

  } catch (err) {
    console.error("❌ Filter API error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};
