// /api/filter.js
export default async function handler(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;

    const perPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);

    const shop = process.env.SHOPIFY_STORE_DOMAIN; // e.g. mystore.myshopify.com
    const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN; // Admin API token

    // ✅ Step 1: Get total product count
    const countRes = await fetch(
      `https://${shop}/admin/api/2025-01/products/count.json`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!countRes.ok) {
      const err = await countRes.text();
      console.error("Count API Error:", err);
      throw new Error("Failed to fetch product count");
    }

    const countData = await countRes.json();
    const totalProducts = countData.count;
    const totalPages = Math.ceil(totalProducts / perPage);

    // ✅ Step 2: Fetch products with pagination
    const endpoint = `https://${shop}/admin/api/2025-01/products.json?limit=${perPage}&page=${currentPage}`;

    const response = await fetch(endpoint, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Products API Error:", response.status, err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();

    // ✅ Step 3: Return clean JSON
    res.status(200).json({
      products: data.products || [],
      pagination: {
        currentPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
