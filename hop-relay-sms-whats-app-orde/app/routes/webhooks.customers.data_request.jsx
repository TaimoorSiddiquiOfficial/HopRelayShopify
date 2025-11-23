import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR Data Request: Customer requests their data
  // According to Shopify documentation, you should:
  // 1. Identify the customer data you store
  // 2. Provide that data to the customer
  
  try {
    const customerId = payload.customer?.id;
    const shopDomain = payload.shop_domain;

    console.log(`GDPR Data Request - Customer ID: ${customerId}, Shop: ${shopDomain}`);
    
    // Log the request for compliance tracking
    // In production, you would:
    // - Gather all customer data from your database
    // - Send it to the customer via email or secure download
    // - Keep audit logs of the request
    
    // For this app, we don't store personal customer data
    // We only store shop-level settings and order notifications
    console.log(`No personal customer data stored for customer ${customerId}`);
    
  } catch (error) {
    console.error("Error processing GDPR data request:", error);
  }

  return new Response();
};
