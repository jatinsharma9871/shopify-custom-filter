// File: api/filter.js

import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    // Get query params from frontend (e.g., vendor, price_min, price_max)
    const { vendor, price_min, price_max } = req.query;

    // Replace with your Shopify store credentials
    const shop = process.env.SHOPIFY_STORE; // e.g. "yourstore.myshopify.com"
    const accessToken = process.env.SHOPIFY_ADMIN_API_KEY; // Private Admin API Key

    // Base URL for Admin API (GraphQL for more flexibility)
    const url = `https://${shop}/admin/api/2025-01/graphql.json`;

    // GraphQL query - fetch products with filters
    let query = `
      {
        products(first: 20, query: "${vendor ? `vendor:${vendor}` : ""} ${price_min ? `variants.price:>=${price_min}` : ""} ${price_max ? `variants.price:<=${price_max}` : ""}") {
          edges {
            node {
              id
              title
              vendor
              productType
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

    // Make request to Shopify
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    // Format results
    const products = data.data.products.edges.map((edge) => {
      const product = edge.node;
      return {
        id: product.id,
        title: product.title,
        vendor: product.vendor,
        type: product.productType,
        url: product.onlineStoreUrl,
        image: product.images.edges[0]?.node.src || null,
        price: product.variants.edges[0]?.node.price || null,
      };
    });

    res.status(200).json({ products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}
