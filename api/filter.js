// /api/search.js
export default async function handler(req, res) {
  try {
    const { q = "", vendor = "", type = "", minPrice = 0, maxPrice = 999999 } = req.query;

    const shop = process.env.SHOPIFY_STORE_DOMAIN;  // yourshop.myshopify.com
    const token = process.env.SHOPIFY_STOREFRONT_TOKEN;

    const query = `
      query Products($query: String, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              handle
              title
              vendor
              productType
              onlineStoreUrl
              featuredImage {
                url
                altText
              }
              priceRange {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
            }
          }
        }
      }
    `;

    // Build search string
    let searchQuery = q ? `title:*${q}*` : "";
    if (vendor) searchQuery += ` vendor:${vendor}`;
    if (type) searchQuery += ` product_type:${type}`;

    const response = await fetch(`https://${shop}/api/2023-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
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

    const products = result.data.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      vendor: node.vendor,
      product_type: node.productType,
      url: `/products/${node.handle}`,
      featured_image: node.featuredImage?.url || "",
      price: `${node.priceRange.minVariantPrice.amount} ${node.priceRange.minVariantPrice.currencyCode}`,
    }));

    res.status(200).json({ products });
  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
