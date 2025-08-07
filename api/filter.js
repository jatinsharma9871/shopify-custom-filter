// /api/filter.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const { vendor, minPrice, maxPrice } = req.query;

  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  const queryParams = [];
  if (vendor) queryParams.push(`vendor:${vendor}`);
  // Optionally filter by other fields
  const query = queryParams.length > 0 ? queryParams.join(' AND ') : '';

  const adminApiUrl = `https://${shop}/admin/api/2024-04/graphql.json`;
  const queryGQL = {
    query: `
      {
        products(first: 250, query: "${query}") {
          edges {
            node {
              id
              title
              vendor
              variants(first: 1) {
                edges {
                  node {
                    price
                  }
                }
              }
              handle
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
    `,
  };

  try {
    const response = await fetch(adminApiUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryGQL),
    });

    const result = await response.json();

    // Apply local price filtering
    const filtered = result.data.products.edges.filter(({ node }) => {
      const price = parseFloat(node.variants.edges[0]?.node.price || 0);
      return price >= minPrice && price <= maxPrice;
    });

    res.status(200).json(filtered.map(({ node }) => ({
      id: node.id,
      title: node.title,
      vendor: node.vendor,
      price: node.variants.edges[0]?.node.price,
      image: node.images.edges[0]?.node.src,
      handle: node.handle,
    })));
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
