import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  sendHopRelaySms,
  sendHopRelayWhatsapp,
  saveHopRelayContact,
  getHopRelayGroups,
  createHopRelayGroup,
  addContactToHopRelayGroup,
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
    try {
      // Save contact
      await saveHopRelayContact({
        secret: settings.hoprelayApiSecret,
        name: customerName || phone,
        phone: phone,
      });
      console.log(`Contact saved: ${customerName} (${phone})`);

      // Get or create "Customers" group
      const groups = await getHopRelayGroups({ secret: settings.hoprelayApiSecret });
      let customersGroup = groups.find(g => g.name === "Customers");
      
      if (!customersGroup) {
        const result = await createHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          name: "Customers",
        });
        customersGroup = result.data;
        console.log('Created "Customers" group');
      }

      // Add contact to "Customers" group
      if (customersGroup) {
        await addContactToHopRelayGroup({
          secret: settings.hoprelayApiSecret,
          phone: phone,
          groupId: customersGroup.id || customersGroup.gid,
        });
        console.log(`Contact added to "Customers" group: ${phone}`);
      }
    } catch (contactError) {
      console.error("Failed to manage contact in HopRelay:", contactError);
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
