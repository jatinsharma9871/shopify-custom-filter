import fetch from "node-fetch";

export default async function handler(req, res) {
  const { cursor, limit = 20 } = req.query;

  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;

  try {
    let url = `https://${shop}/admin/api/2025-01/products.json?limit=${limit}`;

    if (cursor) {
      // Add page_info for cursor-based pagination
      url += `&page_info=${cursor}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: errorText });
    }

    const data = await response.json();

    // Parse pagination from response headers
    const linkHeader = response.headers.get("link");
    let nextCursor = null;
    let prevCursor = null;

    if (linkHeader) {
      const links = linkHeader.split(",");
      links.forEach((link) => {
        const match = link.match(/<([^>]+)>;\s*rel="(\w+)"/);
        if (match) {
          const url = new URL(match[1]);
          const cursorValue = url.searchParams.get("page_info");
          if (match[2] === "next") nextCursor = cursorValue;
          if (match[2] === "previous") prevCursor = cursorValue;
        }
      });
    }

    res.status(200).json({
      products: data.products,
      nextCursor,
      prevCursor,
      limit,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
