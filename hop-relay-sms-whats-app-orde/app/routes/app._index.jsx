import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  createHopRelayApiKey,
  createHopRelaySubscription,
  createHopRelayUser,
  deleteHopRelayApiKey,
  deleteAllHopRelayApiKeys,
  getHopRelayPackages,
  findHopRelayUserByEmail,
  getHopRelayCredits,
  getHopRelaySubscription,
  getHopRelayDevices,
  getHopRelayWaAccounts,
  createHopRelaySsoLink,
  sendHopRelaySmsBulk,
  sendHopRelayWhatsappBulk,
} from "../hoprelay.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  let shopInfo = { name: "", email: "" };

  try {
    const response = await admin.graphql(`#graphql
      query shopInfo {
        shop {
          name
          contactEmail
        }
      }
    `);
    const json = await response.json();
    shopInfo = {
      name: json.data.shop.name,
      email: json.data.shop.contactEmail,
    };
  } catch (error) {
    console.error("Failed to load shop info from Shopify:", error);
  }

  let hoprelaySettings = null;
  try {
    hoprelaySettings = await prisma.hopRelaySettings.findUnique({
      where: { shop: session.shop },
    });
  } catch (error) {
    console.error("Failed to load HopRelay settings:", error);
  }

  let hoprelayPackages = [];
  let hoprelayError = null;

  try {
    hoprelayPackages = await getHopRelayPackages();
  } catch (error) {
    hoprelayError = error.message || "Unable to load HopRelay packages.";
  }

  let hoprelayAccount = null;
  let hoprelayAccountError = null;

  try {
    if (hoprelaySettings?.hoprelayApiSecret) {
      const [credits, subscription] = await Promise.all([
        getHopRelayCredits({ secret: hoprelaySettings.hoprelayApiSecret }),
        getHopRelaySubscription({ secret: hoprelaySettings.hoprelayApiSecret }),
      ]);

      hoprelayAccount = {
        credits: credits?.credits || null,
        currency: credits?.currency || null,
        planName: subscription?.name || hoprelaySettings.hoprelayPlanName,
        usage: subscription?.usage || null,
        packageId: subscription?.package || hoprelaySettings.hoprelayPackageId,
      };

      // Auto-sync active subscription to database
      if (subscription?.package && subscription?.name) {
        const needsUpdate = 
          hoprelaySettings.hoprelayPackageId !== subscription.package ||
          hoprelaySettings.hoprelayPlanName !== subscription.name;
        
        if (needsUpdate) {
          await prisma.hopRelaySettings.update({
            where: { shop: session.shop },
            data: {
              hoprelayPackageId: subscription.package,
              hoprelayPlanName: subscription.name,
            },
          });
          
          // Refresh settings to show updated data
          hoprelaySettings = await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          });
        }
      }
    }
  } catch (error) {
    hoprelayAccountError =
      error.message || "Unable to load HopRelay account details.";
  }

  let hoprelayDevices = [];
  let hoprelayWaAccounts = [];
  let hoprelaySendersError = null;

  try {
    if (hoprelaySettings?.hoprelayApiSecret) {
      const [devices, waAccounts] = await Promise.all([
        getHopRelayDevices({ secret: hoprelaySettings.hoprelayApiSecret }),
        getHopRelayWaAccounts({
          secret: hoprelaySettings.hoprelayApiSecret,
        }),
      ]);

      hoprelayDevices = devices || [];
      hoprelayWaAccounts = waAccounts || [];
    }
  } catch (error) {
    hoprelaySendersError =
      error.message || "Unable to load devices and WhatsApp accounts.";
  }

  return {
    shop: shopInfo,
    hoprelaySettings,
    hoprelayPackages,
    hoprelayError,
    hoprelayAccount,
    hoprelayAccountError,
    hoprelayDevices,
    hoprelayWaAccounts,
    hoprelaySendersError,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  switch (intent) {
    case "create-hoprelay-account": {
      const name = formData.get("name") || "";
      const email = formData.get("email") || "";
      const password = formData.get("password") || "";

      if (!name || !email || !password) {
        return {
          ok: false,
          type: "create-hoprelay-account",
          error: "Name, email, and password are required.",
        };
      }

      try {
        let userId;
        let userEmail = email;

        // If account already exists in HopRelay, just link it instead of creating a new one.
        const existing = await findHopRelayUserByEmail(email);

        if (existing && existing.id !== undefined && existing.id !== null) {
          userId = Number(existing.id);
          userEmail = existing.email || email;
        } else {
          const created = await createHopRelayUser({
            name,
            email,
            password,
          });
          userId = Number(created.id);
        }

        const settings = await prisma.hopRelaySettings.upsert({
          where: { shop: session.shop },
          update: {
            hoprelayUserId: Number(userId),
            hoprelayUserEmail: userEmail,
          },
          create: {
            shop: session.shop,
            hoprelayUserId: Number(userId),
            hoprelayUserEmail: userEmail,
          },
        });

        return {
          ok: true,
          type: "create-hoprelay-account",
          hoprelayUserId: settings.hoprelayUserId,
        };
      } catch (error) {
        console.error("Failed to create HopRelay user:", error);
        return {
          ok: false,
          type: "create-hoprelay-account",
          error: error.message || "Unable to create HopRelay account.",
        };
      }
    }

    case "create-hoprelay-subscription": {
      const packageIdRaw = formData.get("packageId");
      const planName = formData.get("planName") || "";
      const durationMonthsRaw = formData.get("durationMonths") || "1";

      const packageId = Number(packageIdRaw);
      const durationMonths = Number(durationMonthsRaw) || 1;

      if (!packageId || Number.isNaN(packageId)) {
        return {
          ok: false,
          type: "create-hoprelay-subscription",
          error: "Please select a valid pricing plan.",
        };
      }

      try {
        const settings =
          (await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          })) || null;

        if (!settings || !settings.hoprelayUserId) {
          return {
            ok: false,
            type: "create-hoprelay-subscription",
            error: "Create a HopRelay account first.",
          };
        }

        await createHopRelaySubscription({
          userId: settings.hoprelayUserId,
          packageId,
          durationMonths,
        });

        const updated = await prisma.hopRelaySettings.update({
          where: { shop: session.shop },
          data: {
            hoprelayPackageId: packageId,
            hoprelayPlanName: planName || null,
          },
        });

        return {
          ok: true,
          type: "create-hoprelay-subscription",
          hoprelayPackageId: updated.hoprelayPackageId,
          hoprelayPlanName: updated.hoprelayPlanName,
        };
      } catch (error) {
        console.error("Failed to create HopRelay subscription:", error);
        return {
          ok: false,
          type: "create-hoprelay-subscription",
          error: error.message || "Unable to create subscription.",
        };
      }
    }

    case "create-hoprelay-apikey": {
      const name = formData.get("apiKeyName") || "Shopify API Key";
      const smsEnabled = formData.get("smsEnabled") === "on";
      const whatsappEnabled = formData.get("whatsappEnabled") === "on";
      const smsBulkEnabled = formData.get("smsBulkEnabled") === "on";
      const whatsappBulkEnabled = formData.get("whatsappBulkEnabled") === "on";

      try {
        const settings =
          (await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          })) || null;

        if (!settings || !settings.hoprelayUserId) {
          return {
            ok: false,
            type: "create-hoprelay-apikey",
            error: "Create a HopRelay account first.",
          };
        }

        if (settings.hoprelayApiKeyId) {
          return {
            ok: false,
            type: "create-hoprelay-apikey",
            error: "An API key is already connected. Revoke it first.",
          };
        }

        const permissions = [
          "get_credits",
          "get_contacts",
          "get_devices",
          "get_wa_accounts",
          "get_subscription",
        ];

        if (smsEnabled) {
          permissions.push("sms_send");
        }
        if (whatsappEnabled) {
          permissions.push("wa_send");
        }
        if (smsBulkEnabled) {
          permissions.push("sms_send_bulk");
        }
        if (whatsappBulkEnabled) {
          permissions.push("wa_send_bulk");
        }

        const apiKey = await createHopRelayApiKey({
          userId: settings.hoprelayUserId,
          name,
          permissions,
        });

        const updated = await prisma.hopRelaySettings.update({
          where: { shop: session.shop },
          data: {
            hoprelayApiKeyId: Number(apiKey.id),
            hoprelayApiKeyName: name,
            hoprelayApiSecret: apiKey.secret,
            smsEnabled,
            whatsappEnabled,
          },
        });

        return {
          ok: true,
          type: "create-hoprelay-apikey",
          hoprelayApiKeyId: updated.hoprelayApiKeyId,
        };
      } catch (error) {
        console.error("Failed to create HopRelay API key:", error);
        return {
          ok: false,
          type: "create-hoprelay-apikey",
          error: error.message || "Unable to create API key.",
        };
      }
    }

    case "save-hoprelay-notifications": {
      const orderCreatedTemplate =
        formData.get("orderCreatedTemplate") || "";
      const orderShippedTemplate =
        formData.get("orderShippedTemplate") || "";
      const orderDeliveredTemplate =
        formData.get("orderDeliveredTemplate") || "";
      const notifyOrderCreated =
        formData.get("notifyOrderCreated") === "on";
      const notifyOrderShipped =
        formData.get("notifyOrderShipped") === "on";
      const notifyOrderDelivered =
        formData.get("notifyOrderDelivered") === "on";

      try {
        const existing =
          (await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          })) || null;

        if (!existing) {
          await prisma.hopRelaySettings.create({
            data: {
              shop: session.shop,
              orderCreatedTemplate,
              orderShippedTemplate,
              orderDeliveredTemplate,
              notifyOrderCreated,
              notifyOrderShipped,
              notifyOrderDelivered,
            },
          });
        } else {
          await prisma.hopRelaySettings.update({
            where: { shop: session.shop },
            data: {
              orderCreatedTemplate,
              orderShippedTemplate,
              orderDeliveredTemplate,
              notifyOrderCreated,
              notifyOrderShipped,
              notifyOrderDelivered,
            },
          });
        }

        return {
          ok: true,
          type: "save-hoprelay-notifications",
        };
      } catch (error) {
        console.error("Failed to save HopRelay notifications:", error);
        return {
          ok: false,
          type: "save-hoprelay-notifications",
          error: error.message || "Unable to save notification templates.",
        };
      }
    }

    case "send-hoprelay-campaign": {
      const channel = formData.get("channel") || "sms";
      const campaignName = formData.get("campaignName") || "";
      const message = formData.get("message") || "";

      try {
        const settings =
          (await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          })) || null;

        if (!settings || !settings.hoprelayApiSecret) {
          return {
            ok: false,
            type: "send-hoprelay-campaign",
            error: "Create an API key first to send campaigns.",
          };
        }

        if (channel === "whatsapp") {
          const account = formData.get("waAccount") || "";
          const recipients = formData.get("recipients") || "";

          await sendHopRelayWhatsappBulk({
            secret: settings.hoprelayApiSecret,
            account,
            campaign: campaignName,
            message,
            recipients,
          });
        } else {
          const mode = formData.get("smsMode") || "devices";
          const numbers = formData.get("numbers") || "";

          await sendHopRelaySmsBulk({
            secret: settings.hoprelayApiSecret,
            mode,
            campaign: campaignName,
            message,
            numbers,
          });
        }

        await prisma.hopRelaySettings.update({
          where: { shop: session.shop },
          data: {
            marketingDefaultChannel: channel,
            marketingDefaultMode:
              channel === "sms" ? formData.get("smsMode") || "devices" : null,
          },
        });

        return {
          ok: true,
          type: "send-hoprelay-campaign",
        };
      } catch (error) {
        console.error("Failed to send HopRelay campaign:", error);
        return {
          ok: false,
          type: "send-hoprelay-campaign",
          error: error.message || "Unable to send campaign.",
        };
      }
    }

    case "save-hoprelay-senders": {
      const defaultSmsMode = formData.get("defaultSmsMode") || null;
      const defaultSmsDeviceIdRaw = formData.get("defaultSmsDeviceId") || "";
      const defaultSmsSimRaw = formData.get("defaultSmsSim") || "";
      const defaultWaAccountRaw = formData.get("defaultWaAccount") || "";
      const notificationChannelRaw =
        formData.get("notificationChannel") || "";

      const defaultSmsDeviceId = defaultSmsDeviceIdRaw || null;
      const defaultSmsSim = defaultSmsSimRaw
        ? Number(defaultSmsSimRaw)
        : null;
      const defaultWaAccount = defaultWaAccountRaw || null;
      const notificationChannel =
        notificationChannelRaw || "sms";

      try {
        const existing =
          (await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          })) || null;

        if (!existing) {
          await prisma.hopRelaySettings.create({
            data: {
              shop: session.shop,
              defaultSmsMode,
              defaultSmsDeviceId,
              defaultSmsSim,
              defaultWaAccount,
              notificationChannel,
            },
          });
        } else {
          await prisma.hopRelaySettings.update({
            where: { shop: session.shop },
            data: {
              defaultSmsMode,
              defaultSmsDeviceId,
              defaultSmsSim,
              defaultWaAccount,
              notificationChannel,
            },
          });
        }

        return {
          ok: true,
          type: "save-hoprelay-senders",
        };
      } catch (error) {
        console.error("Failed to save default senders:", error);
        return {
          ok: false,
          type: "save-hoprelay-senders",
          error: error.message || "Unable to save default senders.",
        };
      }
    }

    case "disconnect-hoprelay-account": {
      try {
        const existing =
          (await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          })) || null;

        if (!existing) {
          return {
            ok: true,
            type: "disconnect-hoprelay-account",
          };
        }

        await prisma.hopRelaySettings.update({
          where: { shop: session.shop },
          data: {
            hoprelayUserId: null,
            hoprelayUserEmail: null,
            hoprelayApiKeyId: null,
            hoprelayApiKeyName: null,
            hoprelayApiSecret: null,
            hoprelayPackageId: null,
            hoprelayPlanName: null,
            smsEnabled: false,
            whatsappEnabled: false,
            marketingDefaultChannel: null,
            marketingDefaultMode: null,
          },
        });

        return {
          ok: true,
          type: "disconnect-hoprelay-account",
        };
      } catch (error) {
        console.error("Failed to disconnect HopRelay account:", error);
        return {
          ok: false,
          type: "disconnect-hoprelay-account",
          error: error.message || "Unable to disconnect account.",
        };
      }
    }

    case "revoke-hoprelay-apikey": {
      try {
        const existing =
          (await prisma.hopRelaySettings.findUnique({
            where: { shop: session.shop },
          })) || null;

        if (!existing || !existing.hoprelayUserId) {
          return {
            ok: true,
            type: "revoke-hoprelay-apikey",
          };
        }

        // Delete ALL API keys for this user from HopRelay backend
        try {
          const result = await deleteAllHopRelayApiKeys({ userId: existing.hoprelayUserId });
          console.log(`Deleted ${result.deleted} API key(s) for user ${existing.hoprelayUserId}`);
        } catch (error) {
          console.error("Failed to delete API keys from HopRelay:", error);
          // Continue to clear local state even if remote delete fails.
        }

        // Clear all API-related data from local database
        await prisma.hopRelaySettings.update({
          where: { shop: session.shop },
          data: {
            hoprelayApiKeyId: null,
            hoprelayApiKeyName: null,
            hoprelayApiSecret: null,
            smsEnabled: false,
            whatsappEnabled: false,
          },
        });

        return {
          ok: true,
          type: "revoke-hoprelay-apikey",
        };
      } catch (error) {
        console.error("Failed to revoke HopRelay API key:", error);
        return {
          ok: false,
          type: "revoke-hoprelay-apikey",
          error: error.message || "Unable to revoke API key.",
        };
      }
    }

    case "generate-sso-link": {
      const redirect = formData.get("redirect") || "dashboard";
      
      // Validate redirect parameter from form data
      if (typeof redirect !== "string" || redirect.length > 100) {
        return {
          ok: false,
          type: "generate-sso-link",
          error: "Invalid redirect parameter.",
        };
      }
      
      try {
        const settings = await prisma.hopRelaySettings.findUnique({
          where: { shop: session.shop },
        });

        if (!settings?.hoprelayUserId) {
          return {
            ok: false,
            type: "generate-sso-link",
            error: "No HopRelay account linked.",
          };
        }

        // Ensure hoprelayUserId is valid before passing to SSO function
        if (typeof settings.hoprelayUserId !== "number" || settings.hoprelayUserId <= 0) {
          console.error("Invalid hoprelayUserId in database:", settings.hoprelayUserId);
          return {
            ok: false,
            type: "generate-sso-link",
            error: "Invalid account configuration.",
          };
        }

        const ssoUrl = await createHopRelaySsoLink({
          userId: settings.hoprelayUserId,
          redirect,
        });

        return {
          ok: true,
          type: "generate-sso-link",
          url: ssoUrl,
        };
      } catch (error) {
        console.error("Failed to generate SSO link:", error);
        return {
          ok: false,
          type: "generate-sso-link",
          error: error.message || "Unable to generate SSO link.",
        };
      }
    }

    default:
      return {
        ok: false,
        type: "unknown",
        error: "Unknown action.",
      };
  }
};

export default function Index() {
  const {
    shop,
    hoprelaySettings,
    hoprelayPackages,
    hoprelayError,
    hoprelayAccount,
    hoprelayAccountError,
    hoprelayDevices,
    hoprelayWaAccounts,
    hoprelaySendersError,
  } = useLoaderData();

  const createAccountFetcher = useFetcher();
  const createSubscriptionFetcher = useFetcher();
  const createApiKeyFetcher = useFetcher();
  const disconnectAccountFetcher = useFetcher();
  const revokeApiKeyFetcher = useFetcher();
  const sendersFetcher = useFetcher();
  const notificationsFetcher = useFetcher();
  const campaignFetcher = useFetcher();
  const ssoFetcher = useFetcher();

  const shopify = useAppBridge();
  const [activeTab, setActiveTab] = useState("account");
  const isAccountConnected =
    !!hoprelaySettings?.hoprelayUserId &&
    !!hoprelaySettings?.hoprelayUserEmail;

  const initialDefaultSmsDeviceId =
    hoprelaySettings?.defaultSmsDeviceId ||
    (hoprelayDevices && hoprelayDevices[0]?.unique) ||
    "";

  const initialDefaultWaAccount =
    hoprelaySettings?.defaultWaAccount ||
    (hoprelayWaAccounts && hoprelayWaAccounts[0]?.unique) ||
    "";

  useEffect(() => {
    const data =
      createAccountFetcher.data ||
      createSubscriptionFetcher.data ||
      createApiKeyFetcher.data ||
      disconnectAccountFetcher.data ||
      revokeApiKeyFetcher.data ||
      sendersFetcher.data ||
      notificationsFetcher.data ||
      campaignFetcher.data ||
      ssoFetcher.data;

    if (data?.ok) {
      if (data?.type === "generate-sso-link" && data?.url) {
        window.open(data.url, "_blank");
      } else {
        shopify.toast.show("Saved successfully");
      }
    } else if (data?.error) {
      shopify.toast.show(data.error);
    }
  }, [
    createAccountFetcher.data,
    createSubscriptionFetcher.data,
    createApiKeyFetcher.data,
    disconnectAccountFetcher.data,
    revokeApiKeyFetcher.data,
    sendersFetcher.data,
    notificationsFetcher.data,
    campaignFetcher.data,
    ssoFetcher.data,
    shopify,
  ]);

  return (
    <s-page heading="HopRelay Shopify Integration">
      <s-section heading="Welcome to HopRelay Shopify Integration">
        <s-paragraph>
          Automatically send SMS and WhatsApp notifications to your customers
          for order updates and marketing campaigns.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>Create a HopRelay account</s-list-item>
          <s-list-item>Choose a pricing plan</s-list-item>
          <s-list-item>
            Configure notifications and marketing campaigns
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Setup">
        <s-stack direction="inline" gap="base">
          <s-button
            variant={activeTab === "account" ? "primary" : "tertiary"}
            onClick={() => setActiveTab("account")}
          >
            Account &amp; Plan
          </s-button>
          <s-button
            variant={activeTab === "connections" ? "primary" : "tertiary"}
            onClick={() => setActiveTab("connections")}
          >
            Connections
          </s-button>
          <s-button
            variant={activeTab === "notifications" ? "primary" : "tertiary"}
            onClick={() => setActiveTab("notifications")}
          >
            Notifications
          </s-button>
          <s-button
            variant={activeTab === "marketing" ? "primary" : "tertiary"}
            onClick={() => setActiveTab("marketing")}
          >
            Marketing
          </s-button>
        </s-stack>
      </s-section>

      {activeTab === "account" && (
        <s-section heading="HopRelay Account & Plan">
          <s-section heading="Account status">
            {isAccountConnected && (
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base">
                  <s-text>
                    Connected account: {hoprelaySettings.hoprelayUserEmail}
                  </s-text>
                  <disconnectAccountFetcher.Form method="post">
                    <input
                      type="hidden"
                      name="_action"
                      value="disconnect-hoprelay-account"
                    />
                    <s-button
                      type="submit"
                      variant="tertiary"
                      loading={
                        ["loading", "submitting"].includes(
                          disconnectAccountFetcher.state,
                        )
                      }
                    >
                      Disconnect
                    </s-button>
                  </disconnectAccountFetcher.Form>
                </s-stack>
                <s-stack direction="block" gap="tight">
                  <s-text>
                    Default SMS sender:{" "}
                    {hoprelaySettings?.defaultSmsDeviceId
                      ? "Configured"
                      : "Not set (required for SMS notifications)"}
                  </s-text>
                  <s-text>
                    Default WhatsApp sender:{" "}
                    {hoprelaySettings?.defaultWaAccount
                      ? "Configured"
                      : "Not set (required for WhatsApp notifications)"}
                  </s-text>
                  <s-button
                    variant="tertiary"
                    onClick={() => setActiveTab("notifications")}
                  >
                    Set default senders
                  </s-button>
                </s-stack>
              </s-stack>
            )}
            {!hoprelaySettings?.hoprelayApiSecret && (
              <s-text>
                Connect an API key below to view your HopRelay credits and
                subscription usage.
              </s-text>
            )}
            {hoprelaySettings?.hoprelayApiSecret && hoprelayAccountError && (
              <s-text variation="negative">{hoprelayAccountError}</s-text>
            )}
            {hoprelaySettings?.hoprelayApiSecret &&
              hoprelayAccount &&
              !hoprelayAccountError && (
                <s-stack direction="block" gap="tight">
                  <s-text>
                    Plan:{" "}
                    {hoprelayAccount.planName ||
                      hoprelaySettings.hoprelayPlanName ||
                      "Unknown"}
                  </s-text>
                  {hoprelayAccount.credits && (
                    <s-text>
                      Credits: {hoprelayAccount.credits}{" "}
                      {hoprelayAccount.currency || ""}
                    </s-text>
                  )}
                  {hoprelayAccount.usage && (
                    <s-text>
                      SMS used:{" "}
                      {hoprelayAccount.usage.sms_send?.used ?? 0} /{" "}
                      {hoprelayAccount.usage.sms_send?.limit ?? 0}, WhatsApp
                      used: {hoprelayAccount.usage.wa_send?.used ?? 0}
                    </s-text>
                  )}
                </s-stack>
              )}
          </s-section>
          {!isAccountConnected && (
            <>
              <s-heading level="3">Create HopRelay account</s-heading>
              <createAccountFetcher.Form method="post">
                <input
                  type="hidden"
                  name="_action"
                  value="create-hoprelay-account"
                />
                <s-stack direction="block" gap="base">
                  <s-text-field
                    label="Full name"
                    name="name"
                    value={hoprelaySettings?.hoprelayUserEmail ? "" : shop.name}
                    placeholder="Your name"
                  />
                  <s-text-field
                    label="Email"
                    name="email"
                    value={hoprelaySettings?.hoprelayUserEmail || shop.email}
                    placeholder="Store email"
                  />
                  <s-text-field
                    label="Password for HopRelay"
                    name="password"
                    type="password"
                    placeholder="Create a password"
                  />
                  <s-button
                    type="submit"
                    loading={
                      ["loading", "submitting"].includes(
                        createAccountFetcher.state,
                      )
                    }
                  >
                    Create account
                  </s-button>
                </s-stack>
              </createAccountFetcher.Form>
            </>
          )}

          <s-section heading="Choose plan">
            {hoprelayError && (
              <s-text variation="negative">{hoprelayError}</s-text>
            )}
            <createSubscriptionFetcher.Form method="post">
              <input
                type="hidden"
                name="_action"
                value="create-hoprelay-subscription"
              />
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base">
                  {hoprelayPackages.map((pkg) => {
                    const inputId = `hoprelay-plan-${pkg.id}`;
                    return (
                      <div key={pkg.id} style={{ display: "block" }}>
                        <input
                          id={inputId}
                          type="radio"
                          name="packageId"
                          value={pkg.id}
                          defaultChecked={
                            hoprelaySettings?.hoprelayPackageId === pkg.id
                          }
                        />
                        <label htmlFor={inputId} aria-label={pkg.name}>
                          <s-box
                            padding="base"
                            borderWidth="base"
                            borderRadius="base"
                          >
                            <s-heading level="3">{pkg.name}</s-heading>
                            <s-text>
                              ${pkg.price}/mo · {pkg.sms_send_limit} SMS/day ·{" "}
                              {pkg.device_limit} devices
                            </s-text>
                            <input
                              type="hidden"
                              name="planName"
                              value={pkg.name}
                            />
                          </s-box>
                        </label>
                      </div>
                    );
                  })}
                </s-stack>
                <s-button
                  type="submit"
                  loading={
                    ["loading", "submitting"].includes(
                      createSubscriptionFetcher.state,
                    )
                  }
                >
                  {hoprelaySettings?.hoprelayPackageId
                    ? "Update subscription"
                    : "Subscribe"}
                </s-button>
              </s-stack>
            </createSubscriptionFetcher.Form>
          </s-section>

          <s-section heading="API key & permissions">
            {hoprelaySettings?.hoprelayApiKeyId ? (
              <s-stack direction="block" gap="base">
                <s-text>API key connected for this shop.</s-text>
                {hoprelaySettings?.hoprelayApiSecret && (
                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-stack direction="block" gap="small">
                      <s-text>
                        Your API secret (keep this secure):
                      </s-text>
                      <s-stack direction="inline" gap="small" align="center">
                        <pre style={{ margin: 0, flex: 1 }}>
                          <code>••••••••••••••••••••{hoprelaySettings.hoprelayApiSecret.slice(-8)}</code>
                        </pre>
                        <s-button
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            navigator.clipboard.writeText(hoprelaySettings.hoprelayApiSecret);
                            shopify.toast.show('API secret copied to clipboard');
                          }}
                        >
                          Copy
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-box>
                )}
                <revokeApiKeyFetcher.Form method="post">
                  <input
                    type="hidden"
                    name="_action"
                    value="revoke-hoprelay-apikey"
                  />
                  <s-button
                    type="submit"
                    variant="primary"
                    tone="critical"
                    loading={
                      ["loading", "submitting"].includes(
                        revokeApiKeyFetcher.state,
                      )
                    }
                  >
                    Revoke API key
                  </s-button>
                </revokeApiKeyFetcher.Form>
              </s-stack>
            ) : (
              <createApiKeyFetcher.Form method="post">
                <input
                  type="hidden"
                  name="_action"
                  value="create-hoprelay-apikey"
                />
                <s-stack direction="block" gap="base">
                  <s-text-field
                    label="API key name"
                    name="apiKeyName"
                    value={
                      hoprelaySettings?.hoprelayApiKeyName ||
                      `Shopify - ${shop.name}`
                    }
                  />
                  <s-stack direction="block" gap="tight">
                    <label>
                      <input
                        type="checkbox"
                        name="smsEnabled"
                        defaultChecked={hoprelaySettings?.smsEnabled}
                      />{" "}
                      Allow SMS sending (sms_send)
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="whatsappEnabled"
                        defaultChecked={hoprelaySettings?.whatsappEnabled}
                      />{" "}
                      Allow WhatsApp sending (wa_send)
                    </label>
                    <label>
                      <input type="checkbox" name="smsBulkEnabled" /> Allow SMS
                      bulk campaigns (sms_send_bulk)
                    </label>
                    <label>
                      <input type="checkbox" name="whatsappBulkEnabled" /> Allow
                      WhatsApp bulk campaigns (wa_send_bulk)
                    </label>
                  </s-stack>
                  <s-button
                    type="submit"
                    loading={
                      ["loading", "submitting"].includes(
                        createApiKeyFetcher.state,
                      )
                    }
                  >
                    Create API key
                  </s-button>
                </s-stack>
              </createApiKeyFetcher.Form>
            )}
          </s-section>
        </s-section>
      )}

      {activeTab === "connections" && (
        <s-section heading="Connections">
          <s-stack direction="block" gap="base">
            <s-text>
              Connect Android SMS gateways and WhatsApp accounts to HopRelay. These
              senders are used for order notifications and marketing campaigns.
            </s-text>

            <s-stack direction="inline" gap="base">
              <s-button
                onClick={() => {
                  ssoFetcher.submit(
                    { _action: "generate-sso-link", redirect: "dashboard" },
                    { method: "POST" }
                  );
                }}
                loading={ssoFetcher.state !== "idle"}
              >
                Open HopRelay dashboard
              </s-button>
              <s-button
                onClick={() => {
                  ssoFetcher.submit(
                    { _action: "generate-sso-link", redirect: "dashboard/hosts/android" },
                    { method: "POST" }
                  );
                }}
                loading={ssoFetcher.state !== "idle"}
                variant="tertiary"
              >
                Connect Android gateway
              </s-button>
              <s-button
                onClick={() => {
                  ssoFetcher.submit(
                    { _action: "generate-sso-link", redirect: "dashboard/hosts/whatsapp" },
                    { method: "POST" }
                  );
                }}
                loading={ssoFetcher.state !== "idle"}
                variant="tertiary"
              >
                Add WhatsApp account
              </s-button>
            </s-stack>

            <s-section heading="Linked Android SMS devices">
              {hoprelayDevices.length === 0 ? (
                <s-text>
                  No Android devices are linked yet. Install the HopRelay Android app and
                  connect a device from your HopRelay dashboard.
                </s-text>
              ) : (
                <s-stack direction="block" gap="tight">
                  {hoprelayDevices.map((device) => (
                    <s-stack
                      key={device.unique}
                      direction="inline"
                      gap="base"
                      align="center"
                    >
                      <s-badge tone="success">SMS</s-badge>
                      <s-text>
                        {device.device_name || "Android device"} (
                        {device.phone || "No number"})
                      </s-text>
                    </s-stack>
                  ))}
                </s-stack>
              )}
            </s-section>

            <s-section heading="Linked WhatsApp accounts">
              {hoprelayWaAccounts.length === 0 ? (
                <s-text>
                  No WhatsApp accounts are linked yet. Connect WhatsApp from your
                  HopRelay dashboard, then return here to see them listed.
                </s-text>
              ) : (
                <s-stack direction="block" gap="tight">
                  {hoprelayWaAccounts.map((account) => (
                    <s-stack
                      key={account.unique || account.id}
                      direction="inline"
                      gap="base"
                      align="center"
                    >
                      <s-badge tone="success">WhatsApp</s-badge>
                      <s-text>
                        {account.name || "WhatsApp account"} (
                        {account.phone || account.number || "No number"})
                      </s-text>
                    </s-stack>
                  ))}
                </s-stack>
              )}
            </s-section>
          </s-stack>
        </s-section>
      )}

      {activeTab === "notifications" && (
        <s-section heading="Order notification templates">
          <s-stack direction="block" gap="base">
            <notificationsFetcher.Form method="post">
              <input
                type="hidden"
                name="_action"
                value="save-hoprelay-notifications"
              />
              <s-stack direction="block" gap="base">
                <s-text>
                  Configure templates for order events. You can use placeholders
                  like {"{{order_name}}"}, {"{{customer_name}}"},{" "}
                  {"{{tracking_url}}"}.
                </s-text>
                <s-stack direction="block" gap="tight">
                  <label>
                    <input
                      type="checkbox"
                      name="notifyOrderCreated"
                      defaultChecked={
                        hoprelaySettings?.notifyOrderCreated ?? true
                      }
                    />{" "}
                    Send notification when order is created
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="notifyOrderShipped"
                      defaultChecked={
                        hoprelaySettings?.notifyOrderShipped ?? false
                      }
                    />{" "}
                    Send notification when order is fulfilled
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="notifyOrderDelivered"
                      defaultChecked={
                        hoprelaySettings?.notifyOrderDelivered ?? false
                      }
                    />{" "}
                    Send notification when order is delivered (if used)
                  </label>
                </s-stack>
                <s-text-field
                  label="Order received message"
                  name="orderCreatedTemplate"
                  multiline
                  value={hoprelaySettings?.orderCreatedTemplate || ""}
                  placeholder="Hi {{customer_name}}, we received your order {{order_name}}."
                />
                <s-text-field
                  label="Order shipped message"
                  name="orderShippedTemplate"
                  multiline
                  value={hoprelaySettings?.orderShippedTemplate || ""}
                  placeholder="Good news! Order {{order_name}} has shipped. Track: {{tracking_url}}."
                />
                <s-text-field
                  label="Order delivered message"
                  name="orderDeliveredTemplate"
                  multiline
                  value={hoprelaySettings?.orderDeliveredTemplate || ""}
                  placeholder="Your order {{order_name}} was delivered. Thank you for shopping with us!"
                />
                <s-button
                  type="submit"
                  loading={
                    ["loading", "submitting"].includes(
                      notificationsFetcher.state,
                    )
                  }
                >
                  Save notification templates
                </s-button>
              </s-stack>
            </notificationsFetcher.Form>

            <s-section heading="Default sending channels">
              {!hoprelaySettings?.hoprelayApiSecret && (
                <s-text>
                  Connect an API key in the Account tab to configure default
                  Android SMS and WhatsApp senders.
                </s-text>
              )}

              {hoprelaySettings?.hoprelayApiSecret && hoprelaySendersError && (
                <s-text variation="negative">{hoprelaySendersError}</s-text>
              )}

              {hoprelaySettings?.hoprelayApiSecret &&
                !hoprelaySendersError && (
                  <sendersFetcher.Form method="post">
                    <input
                      type="hidden"
                      name="_action"
                      value="save-hoprelay-senders"
                    />
                    <s-stack direction="block" gap="base">
                      <s-heading level="4">Notification channel</s-heading>
                      <s-stack direction="block" gap="tight">
                        <label>
                          <input
                            type="radio"
                            name="notificationChannel"
                            value="sms"
                            defaultChecked={
                              !hoprelaySettings?.notificationChannel ||
                              hoprelaySettings.notificationChannel === "sms"
                            }
                          />{" "}
                          SMS only
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="notificationChannel"
                            value="whatsapp"
                            defaultChecked={
                              hoprelaySettings?.notificationChannel ===
                              "whatsapp"
                            }
                          />{" "}
                          WhatsApp only
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="notificationChannel"
                            value="automatic"
                            defaultChecked={
                              hoprelaySettings?.notificationChannel ===
                              "automatic"
                            }
                          />{" "}
                          Automatic (SMS first, then WhatsApp)
                        </label>
                      </s-stack>

                      <s-heading level="4">Default SMS sender</s-heading>
                      {hoprelayDevices.length === 0 ? (
                        <s-text>
                          No Android devices found. Link your Android SMS app in
                          HopRelay first.
                        </s-text>
                      ) : (
                        <>
                          <label>
                            SMS mode
                            <select
                              name="defaultSmsMode"
                              defaultValue={
                                hoprelaySettings?.defaultSmsMode || "devices"
                              }
                            >
                              <option value="devices">Devices</option>
                              <option value="credits">Credits</option>
                            </select>
                          </label>
                          <label>
                            Default Android device
                            <select
                              name="defaultSmsDeviceId"
                              defaultValue={
                                initialDefaultSmsDeviceId
                              }
                            >
                              <option value="">Choose device</option>
                              {hoprelayDevices.map((device) => (
                                <option
                                  key={device.unique}
                                  value={device.unique}
                                >
                                  {device.device_name} ({device.phone})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            SIM slot
                            <select
                              name="defaultSmsSim"
                              defaultValue={
                                hoprelaySettings?.defaultSmsSim || ""
                              }
                            >
                              <option value="">Auto</option>
                              <option value="1">SIM 1</option>
                              <option value="2">SIM 2</option>
                            </select>
                          </label>
                        </>
                      )}

                      <s-heading level="4">Default WhatsApp account</s-heading>
                      {hoprelayWaAccounts.length === 0 ? (
                        <s-text>
                          No WhatsApp accounts found. Link WhatsApp in HopRelay
                          first.
                        </s-text>
                      ) : (
                          <label>
                            WhatsApp account
                            <select
                              name="defaultWaAccount"
                              defaultValue={
                              initialDefaultWaAccount
                              }
                            >
                            <option value="">Choose account</option>
                            {hoprelayWaAccounts.map((acc) => (
                              <option key={acc.unique} value={acc.unique}>
                                {acc.name} ({acc.phone})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <s-button
                        type="submit"
                        loading={
                          ["loading", "submitting"].includes(
                            sendersFetcher.state,
                          )
                        }
                      >
                        Save default senders
                      </s-button>
                    </s-stack>
                  </sendersFetcher.Form>
                )}
            </s-section>
          </s-stack>
        </s-section>
      )}

      {activeTab === "marketing" && (
        <s-section heading="Create marketing campaign">
          <campaignFetcher.Form method="post">
            <input
              type="hidden"
              name="_action"
              value="send-hoprelay-campaign"
            />
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Campaign name"
                name="campaignName"
                placeholder="Summer Sale Broadcast"
              />
              <s-stack direction="inline" gap="base">
                <label>
                  <input
                    type="radio"
                    name="channel"
                    value="sms"
                    defaultChecked={
                      !hoprelaySettings?.marketingDefaultChannel ||
                      hoprelaySettings?.marketingDefaultChannel === "sms"
                    }
                  />{" "}
                  SMS
                </label>
                <label>
                  <input
                    type="radio"
                    name="channel"
                    value="whatsapp"
                    defaultChecked={
                      hoprelaySettings?.marketingDefaultChannel === "whatsapp"
                    }
                  />{" "}
                  WhatsApp
                </label>
              </s-stack>

              <s-text-field
                label="Message"
                name="message"
                multiline
                placeholder="Write the message you want to send to your customers."
              />

              <s-section heading="SMS options">
                <s-stack direction="block" gap="tight">
                  <s-text-field
                    label="Mode (devices or credits)"
                    name="smsMode"
                    value={
                      hoprelaySettings?.marketingDefaultMode || "devices"
                    }
                    placeholder="devices"
                  />
                  <s-text-field
                    label="Numbers (comma separated)"
                    name="numbers"
                    placeholder="+923001112223,+923004445556"
                  />
                </s-stack>
              </s-section>

              <s-section heading="WhatsApp options">
                <s-stack direction="block" gap="tight">
                  <s-text-field
                    label="WhatsApp account unique ID"
                    name="waAccount"
                    placeholder="From HopRelay dashboard /get/wa.accounts"
                  />
                  <s-text-field
                    label="Recipients (comma separated)"
                    name="recipients"
                    placeholder="+923001112223,+923004445556"
                  />
                </s-stack>
              </s-section>

              <s-button
                type="submit"
                loading={
                  ["loading", "submitting"].includes(campaignFetcher.state)
                }
              >
                Send campaign
              </s-button>
            </s-stack>
          </campaignFetcher.Form>
        </s-section>
      )}

      <s-section slot="aside" heading="HopRelay Pricing Plans">
        <s-unordered-list>
          <s-list-item>
            <s-heading level="4">Starter — $0/mo</s-heading>
            <s-text>
              1,000 SMS/day · Unlimited WhatsApp · 50 contacts · 3 devices
            </s-text>
          </s-list-item>
          <s-list-item>
            <s-heading level="4">Professional — $12/mo (Recommended)</s-heading>
            <s-text>
              3,000 SMS/day · Unlimited WhatsApp · 3,000 contacts · 30 devices
            </s-text>
          </s-list-item>
          <s-list-item>
            <s-heading level="4">Enterprise — $30/mo</s-heading>
            <s-text>
              10,000 SMS/day · Unlimited WhatsApp · Unlimited contacts · 50
              devices
            </s-text>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
