import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR Customer Redact: Delete customer data
  // This webhook is triggered when a customer requests deletion of their data
  // or after a shop has been closed for 48 hours
  
  try {
    const customerId = payload.customer?.id;
    const shopDomain = payload.shop_domain;

    console.log(`GDPR Customer Redact - Customer ID: ${customerId}, Shop: ${shopDomain}`);
    
    // Delete customer-specific data from your database
    // For this app, we don't store personal customer data
    // We only store shop-level settings and order history
    
    // If you stored customer phone numbers, emails, or other PII:
    // - Delete them from your database
    // - Remove them from any third-party services (HopRelay)
    // - Keep audit logs of the deletion
    
    console.log(`No personal customer data to delete for customer ${customerId}`);
    
  } catch (error) {
    console.error("Error processing GDPR customer redact:", error);
  }

  return new Response();
};
