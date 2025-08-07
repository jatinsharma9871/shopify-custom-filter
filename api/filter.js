// api/filter.js

const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  const { vendor, price_min, price_max } = req.query;

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_KEY;

  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing Shopify env vars' });
  }

  if (!vendor || !price_min || !price_max) {
    return res.status(400).json({ error: 'Missing query parameters: vendor, price_min, price_max are required' });
  }

  const min = parseFloat(price_min);
  const max = parseFloat(price_max);

  let pageInfo = null;
  let hasNextPage = true;
  let filteredProducts = [];

  try {
    while (hasNextPage) {
      let url = `https://${SHOPIFY_STORE}/admin/api/2024-04/products.json?limit=250&vendor=${encodeURIComponent(vendor)}&fields=id,title,variants`;

      if (pageInfo) {
        url += `&page_info=${pageInfo}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(500).json({ error: 'Shopify API error', detail: errorText });
      }

      const data = await response.json();

      // Filter products in this page by price range
      const pageFiltered = data.products.filter((product) =>
        product.variants.some((variant) => {
          const price = parseFloat(variant.price);
          return price >= min && price <= max;
        })
      );

      filteredProducts.push(...pageFiltered);

      // Handle pagination
      const linkHeader = response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match && match[1]) {
          const nextUrl = new URL(match[1]);
          pageInfo = nextUrl.searchParams.get("page_info");
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }

    return res.status(200).json({ products: filteredProducts });
  } catch (error) {
    console.error('Filter API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
};
