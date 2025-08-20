export default async function handler(req, res) {
  try {
    const { q = "", vendor = "", type = "", minPrice = 0, maxPrice = 999999 } = req.query;

    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

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
              title
              vendor
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
      return res.status(500).send("Shopify GraphQL error");
    }

    // Build HTML instead of JSON
    const html = result.data.products.edges.map(({ node }) => {
      return `
        <div class="sf__col-item w-6/12 md:w-4/12 px-2 xl:px-3">
          <div class="product-card">
            <a href="/products/${node.handle}">
              <img src="${node.featuredImage?.url || ""}" alt="${node.featuredImage?.altText || node.title}" loading="lazy"/>
              <h3 class="product-title">${node.title}</h3>
              <p class="product-vendor">${node.vendor}</p>
              <p class="product-price">${node.priceRange.minVariantPrice.amount} ${node.priceRange.minVariantPrice.currencyCode}</p>
            </a>
          </div>
        </div>
      `;
    }).join("");

    res.status(200).send(`
      <div class="sf__product-listing sf__col-3 flex flex-wrap -mx-2 xl:-mx-3">
        ${html}
      </div>
    `);
  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).send("Server error");
  }
}
