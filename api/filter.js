// File: /api/filter.js

import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { q } = req.query; // search term for designer (vendor)
    
    // --- Required env vars on Vercel ---
    // SHOPIFY_STORE_URL = yourstore.myshopify.com
    // SHOPIFY_ADMIN_API = Admin API access token
    const shop = process.env.SHOPIFY_STORE_URL;
    const token = process.env.SHOPIFY_ADMIN_API;

    const url = `https://${shop}/admin/api/2025-01/products.json?fields=vendor&limit=250`;

    let vendors = new Set();
    let pageInfo = null;

    do {
      const response = await fetch(pageInfo ? `${url}&page_info=${pageInfo}` : url, {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.statusText}`);
      }

      const data = await response.json();

      data.products.forEach((p) => {
        if (p.vendor) vendors.add(p.vendor.trim());
      });

      // Handle pagination
      const linkHeader = response.headers.get("link");
      if (linkHeader && linkHeader.includes("rel=\"next\"")) {
        const match = linkHeader.match(/page_info=([^&>]+)/);
        pageInfo = match ? match[1] : null;
      } else {
        pageInfo = null;
      }
    } while (pageInfo);

    let vendorList = Array.from(vendors).sort((a, b) => a.localeCompare(b));

    // Filter by search term if provided
    if (q) {
      const term = q.toLowerCase();
      vendorList = vendorList.filter((v) => v.toLowerCase().includes(term));
    }

    res.status(200).json({ designers: vendorList });
  } catch (err) {
    console.error("Error fetching vendors:", err);
    res.status(500).json({ error: "Failed to fetch designers" });
  }
}
