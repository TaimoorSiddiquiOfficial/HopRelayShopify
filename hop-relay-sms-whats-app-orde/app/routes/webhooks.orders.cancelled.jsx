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
    // Note: This requires the API key to have "get_groups", "create_group", and "create_contact" permissions
    try {
      console.log('[Contact Management - Cancelled] Attempting to get groups from HopRelay...');
      const groups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
      console.log(`[Contact Management - Cancelled] Retrieved ${groups.length} groups`);
      
      // Find or create "NonCustomers" group
      let nonCustomersGroup = groups.find(g => g.name === "NonCustomers");
      if (!nonCustomersGroup) {
        console.log('[Contact Management - Cancelled] "NonCustomers" group not found, creating...');
        await createHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          name: "NonCustomers",
        });
        // Re-fetch groups to get the new group ID
        const updatedGroups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
        nonCustomersGroup = updatedGroups.find(g => g.name === "NonCustomers");
        console.log('[Contact Management - Cancelled] Created "NonCustomers" group with ID:', nonCustomersGroup?.id);
      } else {
        console.log('[Contact Management - Cancelled] Found "NonCustomers" group with ID:', nonCustomersGroup.id);
      }

      // Create/update contact in "NonCustomers" group
      // Note: HopRelay API creates new contact or updates existing based on phone number
      if (nonCustomersGroup) {
        console.log(`[Contact Management - Cancelled] Moving contact: ${customerName} (${phone}) to NonCustomers group ${nonCustomersGroup.id}`);
        await createHopRelayContact({
          secret: settings.hoprelayApiSecret,
          name: customerName || phone,
          phone: phone,
          groups: String(nonCustomersGroup.id),
        });
        console.log(`[Contact Management - Cancelled] ✓ Contact added to "NonCustomers" group: ${customerName} (${phone})`);
      }
    } catch (contactError) {
      // Log detailed error information
      if (contactError.details?.status === 403) {
        console.error('[Contact Management - Cancelled] ⚠️  API key permission error:', contactError.details.message);
        console.error('[Contact Management - Cancelled] To enable contact management, your HopRelay API key needs these permissions:');
        console.error('[Contact Management - Cancelled]   - get_groups');
        console.error('[Contact Management - Cancelled]   - create_group');
        console.error('[Contact Management - Cancelled]   - create_contact');
        console.error('[Contact Management - Cancelled] Please update your API key permissions at https://hoprelay.com/dashboard/keys');
      } else {
        console.error('[Contact Management - Cancelled] Failed to move contact:', contactError.message);
        console.error('[Contact Management - Cancelled] Error details:', contactError.details);
      }
    }
  } catch (error) {
    console.error("Error handling orders/cancelled webhook:", error);
  }

  return new Response();
};
