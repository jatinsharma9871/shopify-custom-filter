// Only needed if using Node < 18 locally or Vercel doesn't support fetch natively
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const { vendor, min_price, max_price, color, product_type } = req.query;

    const shop = process.env.SHOPIFY_SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shop || !accessToken) {
      return res.status(500).json({ error: 'Missing Shopify credentials in environment variables' });
    }

    const url = `https://${shop}/admin/api/2024-04/products.json?limit=250`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API Error:', response.status, errorText);
      return res.status(502).json({ error: 'Failed to fetch products from Shopify' });
    }

    const data = await response.json();
    let products = data.products || [];

    // Filtering logic
    products = products.filter((product) => {
      let match = true;

      if (vendor && product.vendor !== vendor) match = false;
      if (product_type && product.product_type !== product_type) match = false;

      // Price range filter
      const prices = product.variants.map((v) => parseFloat(v.price));
      const min = Math.min(...prices);
      const max = Math.max(...prices);

      if (min_price && max < parseFloat(min_price)) match = false;
      if (max_price && min > parseFloat(max_price)) match = false;

      // Tag-based color filter
      if (color && !product.tags.toLowerCase().includes(color.toLowerCase())) match = false;

      return match;
    });

    res.status(200).json({ products });
  } catch (error) {
    console.error('API Handler Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
