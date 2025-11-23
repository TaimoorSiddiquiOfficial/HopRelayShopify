import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR Shop Redact: Delete all shop data
  // This webhook is triggered 48 hours after a shop uninstalls your app
  // You must delete all data related to the shop
  
  try {
    const shopDomain = payload.shop_domain;
    const shopId = payload.shop_id;

    console.log(`GDPR Shop Redact - Shop: ${shopDomain}, Shop ID: ${shopId}`);
    
    // Delete all shop-related data from your database
    await db.session.deleteMany({ where: { shop: shopDomain } });
    await db.hopRelaySettings.deleteMany({ where: { shop: shopDomain } });
    
    console.log(`Deleted all data for shop ${shopDomain}`);
    
    // Note: You should also delete any data from third-party services
    // For HopRelay integration, consider revoking API keys and deleting user data
    // if no other shops are using the same HopRelay account
    
  } catch (error) {
    console.error("Error processing GDPR shop redact:", error);
  }

  return new Response();
};
