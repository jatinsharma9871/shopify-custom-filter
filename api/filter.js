// /api/filter.js
export default async function handler(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;

    const perPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);

    const shop = process.env.SHOPIFY_STORE_DOMAIN; // your-shop.myshopify.com
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    // GraphQL query with pagination
    const query = `
      query Products($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              title
              handle
              vendor
              productType
              featuredImage { url altText }
              priceRange {
                minVariantPrice { amount currencyCode }
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

    // Calculate cursor offset
    // Shopify doesn’t do direct offset pagination, so we simulate:
    // Page 1 = no cursor, Page 2 = skip (page-1)*limit edges, etc.
    let afterCursor = null;

    if (currentPage > 1) {
      // Fetch previous (page-1)*limit products just to get the last cursor
      const prevQuery = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query,
          variables: { first: (currentPage - 1) * perPage },
        }),
      });
      const prevData = await prevQuery.json();
      const prevEdges = prevData.data.products.edges;
      afterCursor = prevEdges.length > 0 ? prevEdges[prevEdges.length - 1].cursor : null;
    }

    // Fetch current page
    const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query,
        variables: { first: perPage, after: afterCursor },
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL Errors:", result.errors);
      return res.status(500).json({ error: result.errors });
    }

    const edges = result.data.products.edges;

    res.status(200).json({
      products: edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        vendor: node.vendor,
        handle: node.handle,
        product_type: node.productType,
        featured_image: node.featuredImage?.url || "",
        price: parseFloat(node.priceRange.minVariantPrice.amount),
      })),
      pagination: {
        currentPage,
        hasNextPage: result.data.products.pageInfo.hasNextPage,
        hasPrevPage: result.data.products.pageInfo.hasPreviousPage,
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
