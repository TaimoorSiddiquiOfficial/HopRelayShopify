import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getHopRelayApiKeys, deleteHopRelayApiKey } from "../hoprelay.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    // Get settings before deleting to revoke API keys from HopRelay
    const settings = await db.hopRelaySettings.findUnique({ where: { shop } });
    
    // Revoke all API keys from HopRelay backend before cleaning up
    if (settings?.hoprelayUserId) {
      try {
        const apiKeys = await getHopRelayApiKeys({ userId: settings.hoprelayUserId });
        
        if (apiKeys && apiKeys.length > 0) {
          const deletePromises = apiKeys.map((apiKey) =>
            deleteHopRelayApiKey({ id: apiKey.id }).catch((error) => {
              console.error(`Failed to delete API key ${apiKey.id}:`, error);
              return null;
            })
          );
          await Promise.all(deletePromises);
          console.log(`Deleted ${apiKeys.length} API key(s) for user ${settings.hoprelayUserId} during app uninstall`);
        }
      } catch (error) {
        console.error("Failed to delete API keys from HopRelay during uninstall:", error);
        // Continue to uninstall even if API key deletion fails
      }
    }
    
    await db.session.deleteMany({ where: { shop } });
    await db.hopRelaySettings.deleteMany({ where: { shop } });
  }

  return new Response();
};
