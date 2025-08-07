// /api/filter.js (Vercel API route)
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  const { query: { vendor, productType, title, tag }, method } = req;

  const queryParts = [];

  if (vendor) queryParts.push(`vendor:${vendor}`);
  if (productType) queryParts.push(`product_type:${productType}`);
  if (title) queryParts.push(`title:*${title}*`);
  if (tag) queryParts.push(`tag:${tag}`);

  const graphqlQuery = {
    query: `
      {
        products(first: 100, query: "${queryParts.join(' ')}") {
          edges {
            cursor
            node {
              id
              title
              vendor
              productType
              tags
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
                    originalSrc
                  }
                }
              }
            }
          }
        }
      }
    `,
  };

  try {
    const response = await fetch(
      "https://YOUR_STORE.myshopify.com/admin/api/2023-10/graphql.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
        },
        body: JSON.stringify(graphqlQuery),
      }
    );

    const data = await response.json();

    if (!response.ok || data.errors) {
      return res.status(500).json({ error: "Shopify GraphQL error", detail: data.errors });
    }

    const products = data.data.products.edges.map(edge => edge.node);

    res.status(200).json({ products });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: err.message });
  }
};
