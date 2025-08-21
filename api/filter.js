// /api/filter.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Shopify credentials (use Vercel env vars)
    const shop = process.env.SHOPIFY_SHOP;
    const token = process.env.SHOPIFY_ADMIN_API_TOKEN;

    // Query params
    const {
      page = 1,
      limit = 20,
      vendor,
      productType,
      title,
    } = req.query;

    const perPage = Math.min(parseInt(limit), 50); // Shopify max = 50
    const pageNum = Math.max(parseInt(page), 1);

    // Build filter query for Shopify Admin API
    let filters = [];
    if (vendor) filters.push(`vendor:${vendor}`);
    if (productType) filters.push(`product_type:${productType}`);
    if (title) filters.push(`title:*${title}*`);

    const queryFilter = filters.length ? `(${filters.join(" AND ")})` : "";

    // GraphQL query
    const gqlQuery = `
      query getProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query) {
          edges {
            cursor
            node {
              id
              title
              vendor
              productType
              handle
              variants(first: 1) {
                edges {
                  node {
                    price
                  }
                }
              }
              images(first: 1) {
                edges {
                  node {
                    src: url
                  }
                }
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

    // Pagination via cursors
    let cursor = null;
    let currentPage = 1;
    let products = [];

    while (currentPage <= pageNum) {
      const response = await fetch(`https://${shop}/admin/api/2024-07/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: gqlQuery,
          variables: { first: perPage, after: cursor, query: queryFilter || null },
        }),
      });

      const result = await response.json();

      if (!result.data || !result.data.products) {
        return res.status(200).json({
          products: [],
          currentPage: pageNum,
          totalPages: 1,
        });
      }

      const edges = result.data.products.edges || [];
      if (!edges.length) {
        return res.status(200).json({
          products: [],
          currentPage: pageNum,
          totalPages: 1,
        });
      }

      // If we reached requested page, return results
      if (currentPage === pageNum) {
        products = edges.map((e) => ({
          id: e.node.id,
          title: e.node.title,
          vendor: e.node.vendor,
          productType: e.node.productType,
          handle: e.node.handle,
          price: e.node.variants.edges[0]?.node?.price || null,
          image: e.node.images.edges[0]?.node?.src || null,
        }));
        break;
      }

      // Prepare for next loop
      cursor = edges[edges.length - 1]?.cursor;
      if (!result.data.products.pageInfo.hasNextPage) break;
      currentPage++;
    }

    // Response
    res.status(200).json({
      products,
      currentPage: pageNum,
      totalPages: currentPage < pageNum ? currentPage : pageNum + 1, // fallback
    });
  } catch (err) {
    console.error("Backend error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
