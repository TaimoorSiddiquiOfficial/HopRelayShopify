import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("customers/redact payload:", JSON.stringify(payload));

  // This app does not persist customer-level data outside Shopify,
  // so there is nothing to delete. If you later store any customer
  // data in your own database, locate and delete it here as required
  // by Shopify's privacy and data retention guidelines.

  return new Response();
};

