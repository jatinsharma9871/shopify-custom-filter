// Vercel API - Fetch filters and products via Admin API
// Make sure you set SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_URL in Vercel Environment Variables

import fetch from "node-fetch";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    const { collection, vendor, productType, color, priceMin, priceMax } = req.query;
    const shop = process.env.SHOPIFY_STORE_URL;
    const token = process.env.SHOPIFY_ACCESS_TOKEN;

    // Step 1 – Build Shopify Admin API URL
    let adminUrl = `${shop}/admin/api/2024-04/products.json?limit=250`;

    if (collection) {
      adminUrl += `&collection_id=${collection}`;
    }

    // Step 2 – Get all products (loop until done)
    let products = [];
    let pageInfo = null;
    do {
      const url = pageInfo ? `${adminUrl}&page_info=${pageInfo}` : adminUrl;

      const resp = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      });

      const linkHeader = resp.headers.get("link");
      const data = await resp.json();

      products = products.concat(data.products);

      if (linkHeader && linkHeader.includes('rel="next"')) {
        pageInfo = linkHeader.match(/page_info=([^&>]+)/)[1];
      } else {
        pageInfo = null;
      }
    } while (pageInfo);

    // Step 3 – Extract filter values
    const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))].sort();
    const productTypes = [...new Set(products.map(p => p.product_type).filter(Boolean))].sort();

    const colors = [];
    products.forEach(p => {
      const colorOption = p.options.find(opt => opt.name.toLowerCase() === "color");
      if (colorOption) {
        colorOption.values.forEach(val => {
          if (!colors.includes(val)) colors.push(val);
        });
      }
    });

    // Step 4 – Send response
    res.status(200).json({
      vendors,
      productTypes,
      colors,
      products,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch filters" });
  }
}
