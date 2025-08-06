const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const { query } = req;
  const { vendor, min_price, max_price, color, product_type } = query;

  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  const url = `https://${shop}/admin/api/2024-04/products.json?limit=250`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    let products = data.products || [];

    // Filtering logic
    products = products.filter((product) => {
      let match = true;

      if (vendor && product.vendor !== vendor) match = false;
      if (product_type && product.product_type !== product_type) match = false;

      // Variant price range filter
      const prices = product.variants.map(v => parseFloat(v.price));
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min_price && max < parseFloat(min_price)) match = false;
      if (max_price && min > parseFloat(max_price)) match = false;

      // Color (via tag)
      if (color && !product.tags.includes(color)) match = false;

      return match;
    });

    res.status(200).json({ products });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
