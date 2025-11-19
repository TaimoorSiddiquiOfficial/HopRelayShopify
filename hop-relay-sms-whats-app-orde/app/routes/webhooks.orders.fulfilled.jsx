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

    if (settings.notifyOrderShipped === false) {
      return new Response();
    }

    const phone = extractPhone(payload);

    if (!phone) {
      console.log("No phone number found for order; skipping notification.");
      return new Response();
    }

    const template =
      settings.orderShippedTemplate ||
      "Good news! Your order {{order_name}} has shipped.";

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
          console.error("Failed to send HopRelay SMS for order fulfilled:", error);
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
            "Failed to send HopRelay WhatsApp for order fulfilled:",
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
              "Failed to send HopRelay SMS for order fulfilled (automatic):",
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
              "Failed to send HopRelay WhatsApp for order fulfilled (automatic):",
              error,
            );
          }),
        );
      }
    }

    if (tasks.length) {
      Promise.all(tasks).catch((error) => {
        console.error(
          "HopRelay send error (background, orders/fulfilled):",
          error,
        );
      });
    }
  } catch (error) {
    console.error("Error handling orders/fulfilled webhook:", error);
  }

  return new Response();
};
