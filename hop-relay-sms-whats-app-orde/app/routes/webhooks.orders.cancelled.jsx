import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  createHopRelayContact,
  getHopRelayGroups,
  createHopRelayGroup,
} from "../hoprelay.server";

function extractPhone(order) {
  return (
    order.phone ||
    order.shipping_address?.phone ||
    order.billing_address?.phone ||
    order.customer?.phone ||
    null
  );
}

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const settings = await prisma.hopRelaySettings.findUnique({
      where: { shop },
    });

    if (!settings || !settings.hoprelayApiSecret) {
      return new Response();
    }

    const phone = extractPhone(payload);

    if (!phone) {
      console.log("No phone number found for cancelled order; skipping contact management.");
      return new Response();
    }

    const customerName =
      payload.customer?.first_name ||
      payload.shipping_address?.name ||
      payload.billing_address?.name ||
      payload.customer?.last_name ||
      "";

    // Add contact to "NonCustomers" group (HopRelay doesn't support removing from groups via API)
    try {
      const groups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
      
      // Find or create "NonCustomers" group
      let nonCustomersGroup = groups.find(g => g.name === "NonCustomers");
      if (!nonCustomersGroup) {
        await createHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          name: "NonCustomers",
        });
        // Re-fetch groups to get the new group ID
        const updatedGroups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
        nonCustomersGroup = updatedGroups.find(g => g.name === "NonCustomers");
        console.log('Created "NonCustomers" group');
      }

      // Create/update contact in "NonCustomers" group
      // Note: HopRelay API creates new contact or updates existing based on phone number
      if (nonCustomersGroup) {
        await createHopRelayContact({
          secret: settings.hoprelayApiSecret,
          name: customerName || phone,
          phone: phone,
          groups: String(nonCustomersGroup.id),
        });
        console.log(`Contact added to "NonCustomers" group: ${customerName} (${phone})`);
      }
    } catch (contactError) {
      console.error("Failed to move contact to NonCustomers group in HopRelay:", contactError);
    }
  } catch (error) {
    console.error("Error handling orders/cancelled webhook:", error);
  }

  return new Response();
};
