import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  sendHopRelaySms,
  sendHopRelayWhatsapp,
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

function renderTemplate(template, replacements) {
  let result = template || "";

  Object.entries(replacements).forEach(([key, value]) => {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    result = result.replace(pattern, value ?? "");
  });

  return result;
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

    if (settings.notifyOrderCreated === false) {
      return new Response();
    }

    const phone = extractPhone(payload);

    if (!phone) {
      console.log("No phone number found for order; skipping notification.");
      return new Response();
    }

    const template =
      settings.orderCreatedTemplate ||
      "Hi {{customer_name}}, we received your order {{order_name}}.";

    const customerName =
      payload.customer?.first_name ||
      payload.shipping_address?.name ||
      payload.billing_address?.name ||
      payload.customer?.last_name ||
      "";

    // Save contact to HopRelay and add to "Customers" group
    // Note: This requires the API key to have "get_groups", "create_group", and "create_contact" permissions
    try {
      console.log('[Contact Management] Attempting to get groups from HopRelay...');
      // Get or create "Customers" group
      const groups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
      console.log(`[Contact Management] Retrieved ${groups.length} groups`);
      let customersGroup = groups.find(g => g.name === "Customers");
      
      if (!customersGroup) {
        console.log('[Contact Management] "Customers" group not found, creating...');
        const result = await createHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          name: "Customers",
        });
        // Re-fetch groups to get the new group ID
        const updatedGroups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
        customersGroup = updatedGroups.find(g => g.name === "Customers");
        console.log('[Contact Management] Created "Customers" group with ID:', customersGroup?.id);
      } else {
        console.log('[Contact Management] Found "Customers" group with ID:', customersGroup.id);
      }

      // Create contact with group ID
      if (customersGroup) {
        console.log(`[Contact Management] Creating contact: ${customerName} (${phone}) in group ${customersGroup.id}`);
        await createHopRelayContact({
          secret: settings.hoprelayApiSecret,
          name: customerName || phone,
          phone: phone,
          groups: String(customersGroup.id), // Pass group ID as string
        });
        console.log(`[Contact Management] ✓ Contact saved to "Customers" group: ${customerName} (${phone})`);
      }
    } catch (contactError) {
      // Log detailed error information
      if (contactError.details?.status === 403) {
        console.error('[Contact Management] ⚠️  API key permission error:', contactError.details.message);
        console.error('[Contact Management] To enable contact management, your HopRelay API key needs these permissions:');
        console.error('[Contact Management]   - get_groups');
        console.error('[Contact Management]   - create_group');
        console.error('[Contact Management]   - create_contact');
        console.error('[Contact Management] Please update your API key permissions at https://hoprelay.com/dashboard/keys');
      } else {
        console.error('[Contact Management] Failed to manage contact:', contactError.message);
        console.error('[Contact Management] Error details:', contactError.details);
      }
      // Continue with notification even if contact management fails
    }

    const message = renderTemplate(template, {
      order_name: payload.name || "",
      customer_name: customerName,
      tracking_url: payload.order_status_url || "",
    });

    const channelPreference = settings.notificationChannel || "sms";

    const smsConfigured =
      settings.smsEnabled &&
      settings.defaultSmsMode === "devices" &&
      settings.defaultSmsDeviceId;

    const waConfigured =
      settings.whatsappEnabled && settings.defaultWaAccount;

    const tasks = [];

    if (channelPreference === "sms" && smsConfigured) {
      tasks.push(
        sendHopRelaySms({
          secret: settings.hoprelayApiSecret,
          mode: "devices",
          phone,
          message,
          device: settings.defaultSmsDeviceId,
          sim: settings.defaultSmsSim ?? undefined,
        }).catch((error) => {
          console.error("Failed to send HopRelay SMS for order create:", error);
        }),
      );
    } else if (channelPreference === "whatsapp" && waConfigured) {
      tasks.push(
        sendHopRelayWhatsapp({
          secret: settings.hoprelayApiSecret,
          account: settings.defaultWaAccount,
          recipient: phone,
          message,
        }).catch((error) => {
          console.error(
            "Failed to send HopRelay WhatsApp for order create:",
            error,
          );
        }),
      );
    } else if (channelPreference === "automatic") {
      if (smsConfigured) {
        tasks.push(
          sendHopRelaySms({
            secret: settings.hoprelayApiSecret,
            mode: "devices",
            phone,
            message,
            device: settings.defaultSmsDeviceId,
            sim: settings.defaultSmsSim ?? undefined,
          }).catch((error) => {
            console.error(
              "Failed to send HopRelay SMS for order create (automatic):",
              error,
            );
          }),
        );
      } else if (waConfigured) {
        tasks.push(
          sendHopRelayWhatsapp({
            secret: settings.hoprelayApiSecret,
            account: settings.defaultWaAccount,
            recipient: phone,
            message,
          }).catch((error) => {
            console.error(
              "Failed to send HopRelay WhatsApp for order create (automatic):",
              error,
            );
          }),
        );
      }
    }

    if (tasks.length) {
      Promise.all(tasks).catch((error) => {
        console.error(
          "HopRelay send error (background, orders/create):",
          error,
        );
      });
    }
  } catch (error) {
    console.error("Error handling orders/create webhook:", error);
  }

  return new Response();
};
