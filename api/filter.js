import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { vendor, minPrice, maxPrice, page = 1, limit = 20 } = req.query;

    // Shopify Admin API credentials
    const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
    const SHOPIFY_ADMIN_API_KEY = process.env.SHOPIFY_ADMIN_API_KEY;
    const SHOPIFY_ADMIN_PASSWORD = process.env.SHOPIFY_ADMIN_PASSWORD;

    const auth = Buffer.from(
      `${SHOPIFY_ADMIN_API_KEY}:${SHOPIFY_ADMIN_PASSWORD}`
    ).toString("base64");

    // Pagination handling
    const currentPage = parseInt(page, 10) || 1;
    const perPage = parseInt(limit, 10) || 20;
    const skip = (currentPage - 1) * perPage;

    // Fetch products from Shopify Admin API
    const response = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2025-01/products.json?limit=250`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Shopify API error: ${response.statusText}` });
    }

    let data = await response.json();
    let products = data.products || [];

    // Filtering by vendor
    if (vendor) {
      products = products.filter((p) =>
        p.vendor.toLowerCase().includes(vendor.toLowerCase())
      );
    }

    // Filtering by price range
    if (minPrice || maxPrice) {
      products = products.filter((p) => {
        const price = parseFloat(p.variants?.[0]?.price || 0);
        if (minPrice && price < parseFloat(minPrice)) return false;
        if (maxPrice && price > parseFloat(maxPrice)) return false;
        return true;
      });
    }

    // Total count for pagination
    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / perPage);

    // Paginate results
    const paginatedProducts = products.slice(skip, skip + perPage);

    res.status(200).json({
      products: paginatedProducts,
      pagination: {
        totalProducts,
        totalPages,
        currentPage,
        perPage,
      },
    });
  } catch (err) {
    console.error("Backend Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
