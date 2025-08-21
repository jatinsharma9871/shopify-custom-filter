export default async function handler(req, res) {
  try {
    const { q = "", vendor = "", type = "", page = 1, limit = 20 } = req.query;

    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // GraphQL query with pagination
    const query = `
      query Products($query: String, $first: Int!, $after: String) {
        products(first: $first, query: $query, after: $after) {
          edges {
            cursor
            node {
              id
              handle
              vendor
              title
              productType
              onlineStoreUrl
              featuredImage { url altText }
              priceRange {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;

    // Build Shopify query string
    let searchQuery = q ? `title:*${q}*` : "";
    if (vendor) searchQuery += ` vendor:${vendor}`;
    if (type) searchQuery += ` product_type:${type}`;

    const perPage = Math.min(parseInt(limit), 50); // Shopify max = 50
    const pageNum = Math.max(parseInt(page), 1);

    let cursor = null;
    let currentPage = 1;
    let products = [];

    while (currentPage <= pageNum) {
      const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query,
          variables: { query: searchQuery || null, first: perPage, after: cursor },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        console.error(result.errors);
        return res.status(500).json({ error: "Shopify GraphQL error", details: result.errors });
      }

      const edges = result.data?.products?.edges || [];
      if (!edges.length) {
        return res.status(200).json({
          products: [],
          pagination: {
            currentPage: pageNum,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        });
      }

      if (currentPage === pageNum) {
        products = edges.map(({ node }) => ({
          id: node.id,
          title: node.title,
          vendor: node.vendor,
          product_type: node.productType,
          url: `/products/${node.handle}`,
          featured_image: node.featuredImage?.url || "",
          price: parseFloat(node.priceRange.minVariantPrice.amount) * 100,
        }));

        return res.status(200).json({
          products,
          pagination: {
            currentPage: pageNum,
            hasNextPage: result.data.products.pageInfo.hasNextPage,
            hasPreviousPage: result.data.products.pageInfo.hasPreviousPage,
          },
        });
      }

      // go to next page
      cursor = edges[edges.length - 1].cursor;
      currentPage++;
    }
  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
