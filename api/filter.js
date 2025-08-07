const fetch = require('node-fetch');

async function fetchAllProducts(accessToken, shop, limit = 250) {
  let products = [];
  let pageInfo = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const url = new URL(`https://${shop}/admin/api/2024-04/products.json`);
    url.searchParams.append('limit', limit);

    if (pageInfo) {
      url.searchParams.append('page_info', pageInfo);
    }

    const res = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Shopify API error: ${errorBody}`);
    }

    const linkHeader = res.headers.get('link');
    const body = await res.json();
    products = products.concat(body.products);

    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^&>]+)/);
      pageInfo = match ? match[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }
  }

  return products;
}

module.exports = async (req, res) => {
  try {
    const shop = process.env.SHOPIFY_SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    const { vendor, product_type, tag, price_min, price_max } = req.query;

    const allProducts = await fetchAllProducts(accessToken, shop);

    const filtered = allProducts.filter(product => {
      const matchVendor = vendor ? product.vendor === vendor : true;
      const matchType = product_type ? product.product_type === product_type : true;
      const matchTag = tag ? product.tags.includes(tag) : true;
      const price = parseFloat(product.variants[0]?.price || '0');
      const matchPriceMin = price_min ? price >= parseFloat(price_min) : true;
      const matchPriceMax = price_max ? price <= parseFloat(price_max) : true;

      return matchVendor && matchType && matchTag && matchPriceMin && matchPriceMax;
    });

    res.status(200).json({ products: filtered });
  } catch (error) {
    res.status(500).json({ error: 'Shopify API error', detail: error.message });
  }
};
