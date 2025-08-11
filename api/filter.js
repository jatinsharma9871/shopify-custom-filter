// /api/filter.js
import fetch from "node-fetch";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g. mystore.myshopify.com
const SHOPIFY_ADMIN_API_KEY = process.env.SHOPIFY_ADMIN_API_KEY; 
const SHOPIFY_ADMIN_API_PASS = process.env.SHOPIFY_ADMIN_API_PASS;

export default async function handler(req, res) {
  try {
    const { meta_only, limit = 50, page = 1, ...filters } = req.query;

    if (meta_only === "true") {
      // Only fetch meta data (min/max price, vendors, colors)
      const meta = await fetchMeta();
      return res.status(200).json(meta);
    }

    // Fetch filtered products
    const products = await fetchProducts(filters, parseInt(limit), parseInt(page));
    return res.status(200).json({ products });
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * Fetch meta data for filters
 */
async function fetchMeta() {
  const query = `
    {
      products(first: 250) {
        edges {
          node {
            vendor
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
            options {
              name
              values
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query);

  let prices = [];
  let vendors = new Set();
  let colors = new Set();

  data.products.edges.forEach(({ node }) => {
    vendors.add(node.vendor);
    const price = parseFloat(node.variants.edges[0]?.node.price || 0);
    if (!isNaN(price)) prices.push(price);

    const colorOption = node.options.find(o => o.name.toLowerCase() === "color");
    if (colorOption) {
      colorOption.values.forEach(c => colors.add(c));
    }
  });

  return {
    price_min: Math.min(...prices),
    price_max: Math.max(...prices),
    vendors: Array.from(vendors),
    colors: Array.from(colors)
  };
}

/**
 * Fetch filtered products
 */
async function fetchProducts(filters, limit, page) {
  const afterCursor = page > 1 ? `, after: "${encodeCursor(page, limit)}"` : "";

  // Build basic GraphQL query filters (example: vendor, price range)
  let queryFilters = [];
  if (filters.vendor) {
    queryFilters.push(`vendor:"${filters.vendor}"`);
  }
  if (filters.price_min && filters.price_max) {
    queryFilters.push(`variants.price:>=${filters.price_min}`);
    queryFilters.push(`variants.price:<=${filters.price_max}`);
  }

  const queryString = queryFilters.length ? `query:"${queryFilters.join(" ")}"` : "";

  const query = `
    {
      products(first: ${limit} ${afterCursor}, ${queryString}) {
        edges {
          node {
            id
            title
            handle
            onlineStoreUrl
            images(first: 1) {
              edges {
                node {
                  src
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query);

  return data.products.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    url: node.onlineStoreUrl || `https://${SHOPIFY_STORE}/products/${node.handle}`,
    image: node.images.edges[0]?.node.src || null,
    price: node.variants.edges[0]?.node.price || null
  }));
}

/**
 * Helper: Shopify GraphQL request
 */
async function shopifyGraphQL(query) {
  const endpoint = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_PASS
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

/**
 * Helper: Encode cursor (simple example for demo)
 */
function encodeCursor(page, limit) {
  return Buffer.from(`page:${page},limit:${limit}`).toString("base64");
}
