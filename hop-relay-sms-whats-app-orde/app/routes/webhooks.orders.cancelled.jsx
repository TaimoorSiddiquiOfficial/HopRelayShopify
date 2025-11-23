import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getHopRelayGroups,
  createHopRelayGroup,
  addContactToHopRelayGroup,
  removeContactFromHopRelayGroup,
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

    // Move contact from "Customers" to "NonCustomers" group
    try {
      const groups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
      
      // Find or create "Customers" group
      let customersGroup = groups.find(g => g.name === "Customers");
      if (!customersGroup) {
        const result = await createHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          name: "Customers",
        });
        customersGroup = result.data;
      }

      // Find or create "NonCustomers" group
      let nonCustomersGroup = groups.find(g => g.name === "NonCustomers");
      if (!nonCustomersGroup) {
        const result = await createHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          name: "NonCustomers",
        });
        nonCustomersGroup = result.data;
        console.log('Created "NonCustomers" group');
      }

      // Remove from "Customers" group if exists
      if (customersGroup) {
        try {
          await removeContactFromHopRelayGroup({
            secret: settings.hoprelayApiSecret,
            phone: phone,
            groupId: customersGroup.id || customersGroup.gid,
          });
          console.log(`Contact removed from "Customers" group: ${phone}`);
        } catch (removeError) {
          // Contact might not be in the group, that's ok
          console.log(`Contact was not in "Customers" group: ${phone}`);
        }
      }

      // Add to "NonCustomers" group
      if (nonCustomersGroup) {
        await addContactToHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          phone: phone,
          groupId: nonCustomersGroup.id || nonCustomersGroup.gid,
        });
        console.log(`Contact moved to "NonCustomers" group: ${customerName} (${phone})`);
      }
    } catch (contactError) {
      console.error("Failed to move contact between groups in HopRelay:", contactError);
    }
  } catch (error) {
    console.error("Error handling orders/cancelled webhook:", error);
  }

  return new Response();
};
