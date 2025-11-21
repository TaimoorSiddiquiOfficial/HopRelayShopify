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
  getHopRelayApiKeys,
  getHopRelayPackages,
  findHopRelayUserByEmail,
  getHopRelayCredits,
  getHopRelaySubscription,
  getHopRelayDevices,
  getHopRelayWaAccounts,
  createHopRelaySsoLink,
  sendHopRelaySmsBulk,
  sendHopRelayWhatsappBulk,
  sendHopRelayPasswordReset,
  verifyHopRelayUserPassword,
  initializeHopRelayAccount,
  verifyCode,
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
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  switch (intent) {
    case "initialize-hoprelay-account": {
      const name = formData.get("name") || "";
      const email = formData.get("email") || "";

      if (!email) {
        return {
          ok: false,
          type: "initialize-hoprelay-account",
          error: "Email address is required.",
        };
      }

      try {
        // Get API secret if available to send emails
        const settings = await prisma.hopRelaySettings.findUnique({
          where: { shop: session.shop },
        });
        
        const result = await initializeHopRelayAccount({ 
          email, 
          name: name || email.split('@')[0],
          apiSecret: settings?.hoprelayApiSecret || null,
        });

        return {
          ok: true,
          type: "initialize-hoprelay-account",
          isNewUser: result.isNewUser,
          email: email,
          generatedPassword: result.generatedPassword,
          message: result.message,
        };
      } catch (error) {
        console.error("Failed to initialize HopRelay account:", error);
        return {
          ok: false,
          type: "initialize-hoprelay-account",
          error: error.message || "Unable to initialize account. Please try again.",
        };
      }
    }

    case "verify-hoprelay-code": {
      const email = formData.get("email") || "";
      const code = formData.get("code") || "";

      if (!email || !code) {
        return {
          ok: false,
          type: "verify-hoprelay-code",
          error: "Email and verification code are required.",
        };
      }

      try {
        const result = await verifyCode({ email, code });

        if (!result.success) {
          return {
            ok: false,
            type: "verify-hoprelay-code",
            error: result.message,
          };
        }

        // Get shop info for API key name
        let shopName = "Shopify Store";
        try {
          const response = await admin.graphql(`#graphql
            query shopInfo {
              shop {
                name
              }
            }
          `);
          const json = await response.json();
          shopName = json.data.shop.name || shopName;
        } catch (error) {
          console.error("Failed to load shop name:", error);
        }

        // Save to database first
        const settings = await prisma.hopRelaySettings.upsert({
          where: { shop: session.shop },
          update: {
            hoprelayUserId: result.userId ? parseInt(result.userId, 10) : 999999,
            hoprelayUserEmail: email,
          },
          create: {
            shop: session.shop,
            hoprelayUserId: result.userId ? parseInt(result.userId, 10) : 999999,
            hoprelayUserEmail: email,
          },
        });

        // Auto-create API key if we have a valid user ID
        let apiKeyCreated = false;
        let apiKeyError = null;
        let freePackageAssigned = false;
        if (result.userId && result.userId !== 999999) {
          try {
            console.log('[verify-hoprelay-code] Auto-creating API key for user:', result.userId);
            const apiKeyData = await createHopRelayApiKey({
              userId: result.userId,
              name: `Shopify - ${shopName}`,
              permissions: ["send", "credits", "devices", "wa.accounts"],
            });

            if (apiKeyData?.secret) {
              await prisma.hopRelaySettings.update({
                where: { shop: session.shop },
                data: {
                  hoprelayApiKeyId: Number(apiKeyData.id) || null,
                  hoprelayApiSecret: apiKeyData.secret,
                  hoprelayApiKeyName: `Shopify - ${shopName}`,
                },
              });
              apiKeyCreated = true;
              console.log('[verify-hoprelay-code] ✅ API key created and saved successfully');
              
              // Auto-assign free package (package ID 1)
              try {
                console.log('[verify-hoprelay-code] Auto-assigning free package to user:', result.userId);
                await createHopRelaySubscription({
                  userId: result.userId,
                  packageId: 1,
                  durationMonths: 1,
                });
                
                await prisma.hopRelaySettings.update({
                  where: { shop: session.shop },
                  data: {
                    hoprelayPackageId: 1,
                    hoprelayPlanName: 'Free Plan',
                  },
                });
                freePackageAssigned = true;
                console.log('[verify-hoprelay-code] ✅ Free package assigned successfully');
              } catch (packageError) {
                console.error('[verify-hoprelay-code] Free package assignment failed:', packageError);
                // Don't fail verification if package assignment fails
              }
            }
          } catch (apiError) {
            console.error('[verify-hoprelay-code] API key creation failed:', apiError);
            apiKeyError = apiError.message;
            
            // If API key already exists, try to fetch existing keys
            if (apiError.message && apiError.message.includes('Invalid Parameters')) {
              try {
                console.log('[verify-hoprelay-code] API key may already exist, fetching existing keys...');
                const existingKeys = await getHopRelayApiKeys({ userId: result.userId });
                if (existingKeys && existingKeys.length > 0) {
                  console.log('[verify-hoprelay-code] ✅ Found existing API key, using it');
                  // User already has API key, no need to create
                  apiKeyCreated = false;
                  apiKeyError = null; // Clear error since this is expected
                }
              } catch (fetchError) {
                console.error('[verify-hoprelay-code] Failed to fetch existing keys:', fetchError);
              }
            }
          }
        }

        return {
          ok: true,
          type: "verify-hoprelay-code",
          hoprelayUserId: settings.hoprelayUserId,
          message: apiKeyCreated && freePackageAssigned
            ? "Account connected successfully! API key created and free package assigned automatically." 
            : apiKeyCreated
            ? "Account connected successfully! API key created automatically."
            : "Account connected successfully!",
          apiKeyCreated,
          freePackageAssigned,
          apiKeyError,
        };
      } catch (error) {
        console.error("Failed to verify code:", error);
        return {
          ok: false,
          type: "verify-hoprelay-code",
          error: error.message || "Verification failed. Please try again.",
        };
      }
    }

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

        // First see if the user already exists (Admin API may be limited by permissions)
        let existing = null;
        try {
          existing = await findHopRelayUserByEmail(email);
        } catch (lookupError) {
          console.error("[create-hoprelay-account] Failed to lookup user:", lookupError);
        }

        // ALWAYS verify password to prevent hijacking existing accounts
        console.log("[create-hoprelay-account] Verifying password for:", email);
        const isPasswordValid = await verifyHopRelayUserPassword({ email, password });

        if (isPasswordValid) {
          // Password is valid - trust the user and associate the correct account
          if (existing && existing.id !== undefined && existing.id !== null) {
            userId = Number(existing.id);
            userEmail = existing.email || email;
            console.log("[create-hoprelay-account] Password verified, existing user via Admin API:", userId);
          } else {
            // Password valid but user not visible in Admin API (permissions issue)
            userId = 999999;
            userEmail = email;
            console.log("[create-hoprelay-account] Password verified but user not visible; using placeholder ID");
          }
        } else {
          // Password invalid: block linking if the account already exists
          if (existing && existing.id !== undefined && existing.id !== null) {
            console.log("[create-hoprelay-account] Password invalid for existing account:", existing.id);
            return {
              ok: false,
              type: "create-hoprelay-account",
              error:
                "Invalid password. If you already have a HopRelay account, please use the correct password or reset it.",
              needsPasswordReset: true,
            };
          }

          // No existing account found; attempt to create a brand new account
          console.log("[create-hoprelay-account] No existing account found; creating new account...");
          try {
            const created = await createHopRelayUser({
              name,
              email,
              password,
            });
            userId = Number(created.id);
            userEmail = created.email || email;
            console.log("[create-hoprelay-account] Successfully created new user:", userId);
          } catch (createError) {
            // Creation failed - likely because email actually exists but is hidden
            console.error("[create-hoprelay-account] Failed to create user after invalid password:", createError);
            return {
              ok: false,
              type: "create-hoprelay-account",
              error:
                "Invalid password. If you already have a HopRelay account, please use the correct password or reset it.",
              needsPasswordReset: true,
            };
          }
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
          const apiKeys = await getHopRelayApiKeys({ userId: existing.hoprelayUserId });
          
          if (apiKeys && apiKeys.length > 0) {
            const deletePromises = apiKeys.map((apiKey) =>
              deleteHopRelayApiKey({ id: apiKey.id }).catch((error) => {
                console.error(`Failed to delete API key ${apiKey.id}:`, error);
                return null;
              })
            );
            await Promise.all(deletePromises);
            console.log(`Deleted ${apiKeys.length} API key(s) for user ${existing.hoprelayUserId}`);
          }
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

    case "reset-password": {
      try {
        const settings = await prisma.hopRelaySettings.findUnique({
          where: { shop: session.shop },
        });

        if (!settings?.hoprelayUserEmail) {
          return {
            ok: false,
            type: "reset-password",
            error: "No HopRelay account linked.",
          };
        }

        await sendHopRelayPasswordReset({ email: settings.hoprelayUserEmail });

        return {
          ok: true,
          type: "reset-password",
          email: settings.hoprelayUserEmail,
        };
      } catch (error) {
        console.error("Failed to send password reset:", error);
        return {
          ok: false,
          type: "reset-password",
          error: error.message || "Unable to send password reset email.",
        };
      }
    }

    case "reset-password-guest": {
      try {
        const email = formData.get("email");
        
        if (!email) {
          return {
            ok: false,
            type: "reset-password-guest",
            error: "Email is required.",
          };
        }

        await sendHopRelayPasswordReset({ email });

        return {
          ok: true,
          type: "reset-password-guest",
          email: email,
        };
      } catch (error) {
        console.error("Failed to send password reset:", error);
        return {
          ok: false,
          type: "reset-password-guest",
          error: error.message || "Unable to send password reset email.",
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
  const resetPasswordFetcher = useFetcher();

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
      ssoFetcher.data ||
      resetPasswordFetcher.data;

    if (data?.ok) {
      if (data?.type === "generate-sso-link" && data?.url) {
        window.open(data.url, "_blank");
      } else if (data?.type === "reset-password") {
        shopify.toast.show(`Password reset email sent to ${data.email}`);
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
    resetPasswordFetcher.data,
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
              <s-heading level="3">Connect HopRelay Account (Simplified)</s-heading>
              <s-text variation="subdued" size="small">
                Simply enter your email address. We'll automatically create an account if needed and send you a verification code.
              </s-text>
              
              {/* Step 1: Enter Email */}
              {!createAccountFetcher.data?.email && (
                <createAccountFetcher.Form method="post">
                  <input
                    type="hidden"
                    name="_action"
                    value="initialize-hoprelay-account"
                  />
                  <s-stack direction="block" gap="base">
                    {createAccountFetcher.data?.error && (
                      <s-text variation="negative">{createAccountFetcher.data.error}</s-text>
                    )}
                    
                    {createAccountFetcher.data?.message && (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="info-subdued">
                        <s-text>{createAccountFetcher.data.message}</s-text>
                      </s-box>
                    )}
                    
                    <s-text-field
                      label="Email Address"
                      name="email"
                      type="email"
                      defaultValue={createAccountFetcher.data?.email || shop.email}
                      placeholder="your@email.com"
                      required
                    />
                    
                    <s-text-field
                      label="Name (optional)"
                      name="name"
                      defaultValue={createAccountFetcher.data?.name || shop.name}
                      placeholder="Your name"
                    />
                    
                    <s-button
                      type="submit"
                      loading={
                        ["loading", "submitting"].includes(
                          createAccountFetcher.state,
                        )
                      }
                    >
                      Send Verification Code
                    </s-button>
                    
                    <s-text variation="subdued" size="small">
                      • Existing users: Receive verification code instantly<br/>
                      • New users: We'll create your account and email your password
                    </s-text>
                  </s-stack>
                </createAccountFetcher.Form>
              )}
              
              {/* Step 2: Enter Verification Code */}
              {createAccountFetcher.data?.email && !createAccountFetcher.data?.hoprelayUserId && (
                <createAccountFetcher.Form method="post">
                  <input
                    type="hidden"
                    name="_action"
                    value="verify-hoprelay-code"
                  />
                  <input
                    type="hidden"
                    name="email"
                    value={createAccountFetcher.data.email}
                  />
                  <s-stack direction="block" gap="base">
                    {createAccountFetcher.data?.message && (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="success-subdued">
                        <s-text>{createAccountFetcher.data.message}</s-text>
                      </s-box>
                    )}
                    
                    {/* Show generated password for new accounts */}
                    {createAccountFetcher.data?.generatedPassword && (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="info-subdued">
                        <s-stack direction="block" gap="tight">
                          <s-text>
                            <strong>Your HopRelay Dashboard Password:</strong>
                          </s-text>
                          <s-text-field
                            label="Password (Save this!)"
                            value={createAccountFetcher.data.generatedPassword}
                            readOnly
                            helpText="Use this password to login directly to HopRelay.com for advanced features"
                          />
                          <s-text variation="subdued" size="small">
                            ⚠️ Save this password securely! You'll need it to access your HopRelay dashboard at hoprelay.com
                          </s-text>
                        </s-stack>
                      </s-box>
                    )}
                    
                    {createAccountFetcher.data?.error && (
                      <s-text variation="negative">{createAccountFetcher.data.error}</s-text>
                    )}
                    
                    <s-text>
                      Verification code sent to: <strong>{createAccountFetcher.data.email}</strong>
                    </s-text>
                    
                    <s-text-field
                      label="Verification Code"
                      name="code"
                      type="text"
                      placeholder="Enter 6-digit code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                    />
                    
                    <s-button
                      type="submit"
                      loading={
                        ["loading", "submitting"].includes(
                          createAccountFetcher.state,
                        )
                      }
                    >
                      Verify & Connect
                    </s-button>
                    
                    <s-button
                      variant="tertiary"
                      onClick={() => window.location.reload()}
                    >
                      Use Different Email
                    </s-button>
                  </s-stack>
                </createAccountFetcher.Form>
              )}
            </>
          )}
          
          {isAccountConnected && (
            <>
              <s-section heading="HopRelay Dashboard Access">
                <s-stack direction="block" gap="base">
                  <s-text variation="subdued" size="small">
                    Access your HopRelay dashboard to manage SMS/WhatsApp accounts, view detailed analytics, and configure advanced features.
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
                      Open HopRelay Dashboard
                    </s-button>
                    <s-button
                      onClick={() => {
                        ssoFetcher.submit(
                          { _action: "generate-sso-link", redirect: "dashboard/hosts/android" },
                          { method: "POST" }
                        );
                      }}
                      loading={ssoFetcher.state !== "idle"}
                      variant="secondary"
                    >
                      Add SMS Gateway
                    </s-button>
                    <s-button
                      onClick={() => {
                        ssoFetcher.submit(
                          { _action: "generate-sso-link", redirect: "dashboard/hosts/whatsapp" },
                          { method: "POST" }
                        );
                      }}
                      loading={ssoFetcher.state !== "idle"}
                      variant="secondary"
                    >
                      Add WhatsApp Account
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-section>
              
              <s-section heading="Account Access">
                <s-stack direction="block" gap="base">
                  <s-text variation="subdued" size="small">
                    Need to reset your HopRelay.com password?
                  </s-text>
                  <resetPasswordFetcher.Form method="post">
                    <input type="hidden" name="_action" value="reset-password" />
                    <s-button
                      type="submit"
                      variant="secondary"
                      loading={
                        ["loading", "submitting"].includes(
                          resetPasswordFetcher.state,
                        )
                      }
                    >
                      Send Password Reset Email
                    </s-button>
                  </resetPasswordFetcher.Form>
                </s-stack>
              </s-section>
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
                    <s-text>
                      Your API secret (use in your Shopify integrations):
                    </s-text>
                    <pre style={{ margin: 0 }}>
                      <code>{hoprelaySettings.hoprelayApiSecret}</code>
                    </pre>
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
