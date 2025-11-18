import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("shop/redact payload:", JSON.stringify(payload));

  // Delete shop-specific data you store for this app.
  try {
    await prisma.hopRelaySettings.deleteMany({
      where: { shop },
    });
  } catch (error) {
    console.error("Error deleting HopRelaySettings for shop/redact:", error);
  }

  // Session data is already removed on app/uninstalled webhook, but
  // you could also clean other tables here if you add them later.

  return new Response();
};

