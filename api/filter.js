// api/filter.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  const { vendor, price_min, price_max } = req.query;

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_KEY;

  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const url = `https://${SHOPIFY_STORE}/admin/api/2024-04/products.json?vendor=${vendor}&fields=id,title,variants`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: 'Shopify API error', detail: errorText });
    }

    const data = await response.json();

    // Filter by price range
    const filteredProducts = data.products.filter((product) => {
      return product.variants.some((variant) => {
        const price = parseFloat(variant.price);
        return price >= price_min && price <= price_max;
      });
    });

    res.status(200).json({ products: filteredProducts });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
};
