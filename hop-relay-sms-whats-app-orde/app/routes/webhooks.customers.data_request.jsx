import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("customers/data_request payload:", JSON.stringify(payload));

  // This app does not store any customer-level data outside of Shopify,
  // so there is nothing to return. If you later persist customer data
  // in your own database, gather it here and send it to the merchant
  // according to Shopify's privacy guidelines.

  return new Response();
};

