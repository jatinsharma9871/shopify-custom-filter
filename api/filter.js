// File: /api/filter.js

export default async function handler(req, res) {
  try {
    // Parse query params
    const { vendor, minPrice, maxPrice } = req.query;

    // Required env vars (set in Vercel Dashboard → Settings → Environment Variables)
    const shop = process.env.SHOPIFY_SHOP; // e.g. thesverve.myshopify.com
    const token = process.env.SHOPIFY_ADMIN_API; // Admin API access token

    if (!shop || !token) {
      return res.status(500).json({ error: "Missing Shopify credentials." });
    }

    // Build GraphQL query dynamically
    let queryFilter = [];
    if (vendor) queryFilter.push(`vendor:${vendor}`);
    if (minPrice) queryFilter.push(`variants.price:>=${minPrice}`);
    if (maxPrice) queryFilter.push(`variants.price:<=${maxPrice}`);

    const gqlQuery = `
      {
        products(first: 50, query: "${queryFilter.join(" ")}") {
          edges {
            node {
              id
              title
              vendor
              productType
              handle
              variants(first: 1) {
                edges {
                  node {
                    price
                  }
                }
              }
              images(first: 1) {
                edges {
                  node {
                    src
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Fetch from Shopify Admin GraphQL API
    const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: gqlQuery }),
    });

    const data = await response.json();

    if (data.errors) {
      return res.status(500).json({ error: data.errors });
    }

    // Return products
    res.status(200).json(data.data.products.edges.map(edge => edge.node));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
