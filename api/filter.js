export default async function handler(req, res) {
  try {
    const { vendor, minPrice, maxPrice, limit = 50 } = req.query;

    // Shopify Admin API endpoint (max 250 per page)
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/products.json?limit=${limit}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let products = data.products || [];

    // Filter by vendor
    if (vendor) {
      products = products.filter(
        (p) => p.vendor?.toLowerCase() === vendor.toLowerCase()
      );
    }

    // Filter by price range
    if (minPrice) {
      products = products.filter((p) =>
        p.variants.some((v) => parseFloat(v.price) >= parseFloat(minPrice))
      );
    }
    if (maxPrice) {
      products = products.filter((p) =>
        p.variants.some((v) => parseFloat(v.price) <= parseFloat(maxPrice))
      );
    }

    res.status(200).json({ products });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
