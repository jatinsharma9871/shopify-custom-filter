const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const port = 3000;

app.get('/api/filter', async (req, res) => {
  const { vendor, type, priceMin, priceMax } = req.query;

  try {
    const url = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=250`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_ACCESS,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();

    const filtered = data.products.filter(product => {
      const matchesVendor = vendor ? product.vendor.toLowerCase().includes(vendor.toLowerCase()) : true;
      const matchesType = type ? product.product_type.toLowerCase().includes(type.toLowerCase()) : true;
      const matchesPrice = product.variants.some(variant => {
        const price = parseFloat(variant.price);
        return (!priceMin || price >= parseFloat(priceMin)) && (!priceMax || price <= parseFloat(priceMax));
      });

      return matchesVendor && matchesType && matchesPrice;
    });

    res.status(200).json({ products: filtered });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
