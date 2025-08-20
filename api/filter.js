export default async function handler(req, res) {
  try {
    const { q = "", vendor = "", type = "" } = req.query;

    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const query = `
      query Products($query: String, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
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
        }
      }
    `;

    // Build Shopify query string
    let searchQuery = q ? `title:*${q}*` : "";
    if (vendor) searchQuery += ` vendor:${vendor}`;
    if (type) searchQuery += ` product_type:${type}`;

    const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query,
        variables: { query: searchQuery, first: 50 },
      }),
    });

    const result = await response.json();
    if (result.errors) {
      console.error(result.errors);
      return res.status(500).json({ error: "Shopify GraphQL error", details: result.errors });
    }

    // ✅ Return clean JSON for frontend
    res.status(200).json({
      products: result.data.products.edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        vendor: node.vendor,
        product_type: node.productType,
        url: `/products/${node.handle}`,
        featured_image: node.featuredImage?.url || "",
        price: parseFloat(node.priceRange.minVariantPrice.amount) * 100 // store as integer
      }))
    });

  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
