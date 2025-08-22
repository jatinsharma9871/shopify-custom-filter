export default async function handler(req, res) {
  try {
    const { vendor, minPrice, maxPrice } = req.query;

    // Shopify Admin API endpoint
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/products.json?vendor=${vendor}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();

    // Optional filtering by price
    let products = data.products;
    if (minPrice) {
      products = products.filter(p => p.variants.some(v => parseFloat(v.price) >= parseFloat(minPrice)));
    }
    if (maxPrice) {
      products = products.filter(p => p.variants.some(v => parseFloat(v.price) <= parseFloat(maxPrice)));
    }

    res.status(200).json({ products });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
