import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  sendHopRelaySms,
  sendHopRelayWhatsapp,
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

    const message = renderTemplate(template, {
      order_name: payload.name || "",
      customer_name: customerName,
      tracking_url: payload.order_status_url || "",
    });

    const tasks = [];

    if (
      settings.smsEnabled &&
      settings.defaultSmsMode === "devices" &&
      settings.defaultSmsDeviceId
    ) {
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
    }

    if (settings.whatsappEnabled && settings.defaultWaAccount) {
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
