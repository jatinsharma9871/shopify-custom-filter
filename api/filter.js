// Top of your filter.js or server.js
const fetch = require('node-fetch');

// Example usage
const response = await fetch('https://the-sverve.myshopify.com/admin/api/2024-04/products.json', {
  method: 'GET',
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  }
});
 
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const { vendor, type, priceMin, priceMax } = req.query;

    const url = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=250`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `Shopify API Error`, details: errText });
    }

    const data = await response.json();

    const filtered = data.products.filter(product => {
      const matchesVendor = vendor ? product.vendor.toLowerCase().includes(vendor.toLowerCase()) : true;
      const matchesType = type ? product.product_type.toLowerCase().includes(type.toLowerCase()) : true;
      const matchesPrice = product.variants.some(variant => {
        return (!priceMin || parseFloat(variant.price) >= parseFloat(priceMin)) &&
               (!priceMax || parseFloat(variant.price) <= parseFloat(priceMax));
      });

      return matchesVendor && matchesType && matchesPrice;
    });

    res.status(200).json({ products: filtered });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
};
