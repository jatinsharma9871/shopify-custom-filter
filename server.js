const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const { vendor, price_min, price_max } = req.query;

    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Missing environment variables' });
    }

    const query = `
      {
        products(first: 50, query: "vendor:${vendor} AND variants.price:>=${price_min} AND variants.price:<=${price_max}") {
          edges {
            node {
              id
              title
              vendor
              productType
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

    const response = await fetch(`https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query })
    });

    const json = await response.json();

    if (json.errors) {
      return res.status(500).json({ error: 'Shopify GraphQL error', detail: json.errors });
    }

    const products = json.data.products.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      vendor: edge.node.vendor,
      productType: edge.node.productType,
      price: edge.node.variants.edges[0]?.node.price || null
    }));

    return res.status(200).json({ products });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
};
