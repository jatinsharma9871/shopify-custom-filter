import fetch from 'node-fetch';

export default async function handler(req, res) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN; // your-store.myshopify.com
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  const endpoint = `https://${shop}/admin/api/2025-01/products.json?fields=vendor,product_type,tags,variants&limit=250`;
  let products = [];
  let pageInfo = null;

  try {
    do {
      const url = pageInfo ? `${endpoint}&page_info=${pageInfo}` : endpoint;

      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error(await response.text());
      const linkHeader = response.headers.get('link');
      const json = await response.json();
      products = products.concat(json.products);

      // Handle pagination
      if (linkHeader && linkHeader.includes('rel="next"')) {
        pageInfo = linkHeader.match(/page_info=([^&>]+)/)?.[1];
      } else {
        pageInfo = null;
      }
    } while (pageInfo);

    // Build unique filter sets
    const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))].sort();
    const productTypes = [...new Set(products.map(p => p.product_type).filter(Boolean))].sort();
    const tags = [...new Set(products.flatMap(p => p.tags).filter(Boolean))].sort();

    res.status(200).json({ vendors, productTypes, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
