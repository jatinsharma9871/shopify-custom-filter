const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const { q = '', vendor = '', min_price = 0, max_price = 1000000 } = req.query;

  const endpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/products.json?limit=250`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_TOKEN,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return res.status(500).json({ error: 'Failed to fetch products' });
  }

  const data = await response.json();

  const filtered = data.products.filter(product => {
    const matchesVendor = vendor ? product.vendor.toLowerCase().includes(vendor.toLowerCase()) : true;
    const matchesQuery = q ? product.title.toLowerCase().includes(q.toLowerCase()) : true;
    const price = parseFloat(product.variants[0].price);
    const matchesPrice = price >= min_price && price <= max_price;
    return matchesVendor && matchesQuery && matchesPrice;
  });

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ products: filtered });
};
