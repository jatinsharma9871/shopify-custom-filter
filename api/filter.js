const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const { vendor, type, priceMin, priceMax } = req.query;

  const url = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=250`;

  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();

  const filtered = data.products.filter(product => {
    const matchesVendor = vendor ? product.vendor.toLowerCase().includes(vendor.toLowerCase()) : true;
    const matchesType = type ? product.product_type.toLowerCase().includes(type.toLowerCase()) : true;
    const matchesPrice = product.variants.some(variant => {
      return (!priceMin || variant.price >= priceMin) && (!priceMax || variant.price <= priceMax);
    });

    return matchesVendor && matchesType && matchesPrice;
  });

  res.status(200).json({ products: filtered });
};