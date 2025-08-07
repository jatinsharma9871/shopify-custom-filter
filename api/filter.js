// pages/api/filter.js

const fetch = require('node-fetch');

async function getAllProducts() {
  let products = [];
  let url = `https://${process.env.SHOP}.myshopify.com/admin/api/2024-04/products.json?limit=250`;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (data.products) {
      products = products.concat(data.products);
    }

    const linkHeader = response.headers.get('link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const matches = linkHeader.match(/<([^>]+)>; rel="next"/);
      if (matches) {
        url = matches[1];
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
  }

  return products;
}

export default async function handler(req, res) {
  try {
    const allProducts = await getAllProducts();

    // Apply vendor filter manually
    const { vendor } = req.query;
    let filtered = allProducts;

    if (vendor) {
      filtered = allProducts.filter(
        (product) => product.vendor.toLowerCase() === vendor.toLowerCase()
      );
    }

    res.status(200).json({ products: filtered });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products', detail: err.message });
  }
}
