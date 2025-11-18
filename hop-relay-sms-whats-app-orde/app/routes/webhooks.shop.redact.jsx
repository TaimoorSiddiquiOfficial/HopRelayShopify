import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("shop/redact payload:", JSON.stringify(payload));

  // Delete all shop-specific data as required by GDPR
  try {
    // Delete HopRelay settings
    await prisma.hopRelaySettings.deleteMany({
      where: { shop },
    });

    // Delete sessions
    await prisma.session.deleteMany({
      where: { shop },
    });

    console.log(`Successfully redacted all data for shop: ${shop}`);
  } catch (error) {
    console.error("Error deleting data for shop/redact:", error);
  }

  return new Response();
};

