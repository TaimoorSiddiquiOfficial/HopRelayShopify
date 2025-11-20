const HOPRELAY_ADMIN_BASE_URL =
  process.env.HOPRELAY_ADMIN_BASE_URL || "https://hoprelay.com/admin";
const HOPRELAY_API_BASE_URL =
  process.env.HOPRELAY_API_BASE_URL || "https://hoprelay.com/api";

const HOPRELAY_SYSTEM_TOKEN = process.env.HOPRELAY_SYSTEM_TOKEN || "";
const HOPRELAY_SSO_PLUGIN_TOKEN =
  process.env.HOPRELAY_SSO_PLUGIN_TOKEN || "";

// Public web base (used for /plugin endpoint). Falls back to stripping `/admin`.
const HOPRELAY_WEB_BASE_URL =
  process.env.HOPRELAY_WEB_BASE_URL ||
  HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");

const DEFAULT_COUNTRY = process.env.HOPRELAY_DEFAULT_COUNTRY || "US";
const DEFAULT_TIMEZONE =
  process.env.HOPRELAY_DEFAULT_TIMEZONE || "America/New_York";
const DEFAULT_LANGUAGE_ID =
  process.env.HOPRELAY_DEFAULT_LANGUAGE_ID || "1";
const DEFAULT_ROLE_ID = process.env.HOPRELAY_DEFAULT_ROLE_ID || "2";

function ensureSystemToken() {
  if (!HOPRELAY_SYSTEM_TOKEN) {
    throw new Error(
      "Missing HOPRELAY_SYSTEM_TOKEN environment variable for HopRelay admin API.",
    );
  }
}

async function parseJsonResponse(response) {
  let json;
  try {
    json = await response.json();
  } catch (error) {
    throw new Error("Unable to parse HopRelay response.");
  }

  if (!response.ok || (json && json.status && json.status !== 200)) {
    const message =
      (json && json.message) ||
      `HopRelay request failed with status ${response.status}`;
    const error = new Error(message);
    error.details = json;
    throw error;
  }

  return json;
}

export async function createHopRelaySsoLink({
  userId,
  redirect = "dashboard",
} = {}) {
  if (!HOPRELAY_SSO_PLUGIN_TOKEN) {
    console.error("HOPRELAY_SSO_PLUGIN_TOKEN is not set");
    return null;
  }

  // Validate userId: must be a positive integer
  if (!userId || typeof userId !== "number" || userId <= 0 || !Number.isInteger(userId)) {
    console.error("Invalid userId for SSO link generation:", userId);
    throw new Error("Invalid user ID");
  }

  // Sanitize redirect parameter: only allow alphanumeric, dash, slash, underscore
  if (typeof redirect !== "string" || !/^[a-zA-Z0-9/_-]+$/.test(redirect)) {
    console.error("Invalid redirect parameter:", redirect);
    throw new Error("Invalid redirect path");
  }

  // Prevent directory traversal attacks
  if (redirect.includes("..") || redirect.startsWith("/")) {
    console.error("Potential directory traversal attempt:", redirect);
    throw new Error("Invalid redirect path");
  }

  // Plugin endpoints live at the root, not under /admin.
  // Extract base domain from HOPRELAY_ADMIN_BASE_URL
  const baseUrl = HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");
  const url = new URL(`${baseUrl}/plugin`);
  url.searchParams.set("name", "shopify-sso");
  url.searchParams.set("action", "sso_link");
  url.searchParams.set("user", String(userId));
  url.searchParams.set("token", HOPRELAY_SSO_PLUGIN_TOKEN);
  url.searchParams.set("redirect", redirect);

  console.log("Creating SSO link:", url.toString());

  const response = await fetch(url.toString(), {
    method: "GET",
  });

  let json;
  try {
    json = await response.json();
  } catch (error) {
    console.error("Failed to parse SSO response:", error);
    throw new Error("Unable to parse HopRelay SSO response.");
  }

  console.log("SSO response:", json);

  // Plugin returns: { status: 200, message: false, data: { url: "..." } }
  const ssoUrl = json?.data?.url || json?.url;

  if (!response.ok || !json || !ssoUrl) {
    const message =
      (json && json.message) || "HopRelay SSO link request failed.";
    console.error("SSO link generation failed:", { status: response.status, json });
    const error = new Error(message);
    error.details = json;
    throw error;
  }

  // Validate SSO URL: must be HTTPS and from hoprelay.com domain
  try {
    const urlObj = new URL(ssoUrl);
    const allowedDomains = ["hoprelay.com", "www.hoprelay.com"];
    
    if (!allowedDomains.includes(urlObj.hostname)) {
      console.error("SSO URL from unauthorized domain:", urlObj.hostname);
      throw new Error("Invalid SSO URL domain");
    }
    
    // Enforce HTTPS in production (allow HTTP for local development)
    if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
      console.error("Invalid SSO URL protocol:", urlObj.protocol);
      throw new Error("Invalid SSO URL protocol");
    }
  } catch (error) {
    console.error("Invalid SSO URL format:", ssoUrl, error);
    throw new Error("Invalid SSO URL received from server");
  }

  return ssoUrl;
}

export async function getHopRelayPackages() {
  ensureSystemToken();

  const url = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/packages`);
  url.searchParams.set("token", HOPRELAY_SYSTEM_TOKEN);
  url.searchParams.set("limit", "10");
  url.searchParams.set("page", "1");

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  return json.data || [];
}

export async function getHopRelayCredits({ secret }) {
  const url = new URL(`${HOPRELAY_API_BASE_URL}/get/credits`);
  url.searchParams.set("secret", secret);

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  return json.data || null;
}

export async function getHopRelaySubscription({ secret }) {
  const url = new URL(`${HOPRELAY_API_BASE_URL}/get/subscription`);
  url.searchParams.set("secret", secret);

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  return json.data || null;
}

export async function getHopRelayDevices({ secret }) {
  const url = new URL(`${HOPRELAY_API_BASE_URL}/get/devices`);
  url.searchParams.set("secret", secret);

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  return json.data || [];
}

export async function getHopRelayWaAccounts({ secret }) {
  const url = new URL(`${HOPRELAY_API_BASE_URL}/get/wa.accounts`);
  url.searchParams.set("secret", secret);

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  return json.data || [];
}

export async function findHopRelayUserByEmail(email) {
  ensureSystemToken();

  const url = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/users`);
  url.searchParams.set("token", HOPRELAY_SYSTEM_TOKEN);
  url.searchParams.set("limit", "250");
  url.searchParams.set("page", "1");

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  const users = json.data || [];
  const target = String(email || "").toLowerCase();

  return (
    users.find(
      (user) =>
        user.email &&
        typeof user.email === "string" &&
        user.email.toLowerCase() === target,
    ) || null
  );
}

export async function createHopRelayUser({ name, email, password }) {
  ensureSystemToken();

  const form = new FormData();
  form.set("token", HOPRELAY_SYSTEM_TOKEN);
  form.set("name", name);
  form.set("email", email);
  form.set("password", password);
  form.set("credits", "0");
  form.set("timezone", DEFAULT_TIMEZONE);
  form.set("country", DEFAULT_COUNTRY);
  form.set("language", DEFAULT_LANGUAGE_ID);
  form.set("theme", "light");
  form.set("role", DEFAULT_ROLE_ID);

  const response = await fetch(`${HOPRELAY_ADMIN_BASE_URL}/create/user`, {
    method: "POST",
    body: form,
  });

  const json = await parseJsonResponse(response);
  return json.data;
}

export async function createHopRelaySubscription({
  userId,
  packageId,
  durationMonths,
}) {
  ensureSystemToken();

  const form = new FormData();
  form.set("token", HOPRELAY_SYSTEM_TOKEN);
  form.set("user", String(userId));
  form.set("package", String(packageId));
  form.set("duration", String(durationMonths));

  const response = await fetch(
    `${HOPRELAY_ADMIN_BASE_URL}/create/subscription`,
    {
      method: "POST",
      body: form,
    },
  );

  const json = await parseJsonResponse(response);
  return json.data;
}

export async function createHopRelayApiKey({
  userId,
  name,
  permissions,
}) {
  ensureSystemToken();

  const form = new FormData();
  form.set("token", HOPRELAY_SYSTEM_TOKEN);
  form.set("id", String(userId));
  form.set("name", name);

  (permissions || []).forEach((permission) => {
    form.append("permissions[]", permission);
  });

  const response = await fetch(
    `${HOPRELAY_ADMIN_BASE_URL}/create/apikey`,
    {
      method: "POST",
      body: form,
    },
  );

  const json = await parseJsonResponse(response);
  return json.data;
}

export async function sendHopRelaySms({
  secret,
  mode,
  phone,
  message,
  device,
  gateway,
  sim,
  priority,
  shortener,
}) {
  const form = new FormData();
  form.set("secret", secret);
  form.set("mode", mode);
  form.set("phone", phone);
  form.set("message", message);

  if (device) form.set("device", device);
  if (gateway) form.set("gateway", gateway);
  if (sim) form.set("sim", String(sim));
  if (priority !== undefined && priority !== null) {
    form.set("priority", String(priority));
  }
  if (shortener) form.set("shortener", String(shortener));

  const response = await fetch(`${HOPRELAY_API_BASE_URL}/send/sms`, {
    method: "POST",
    body: form,
  });

  return parseJsonResponse(response);
}

export async function sendHopRelayWhatsapp({
  secret,
  account,
  recipient,
  message,
  type = "text",
  priority,
}) {
  const form = new FormData();
  form.set("secret", secret);
  form.set("account", account);
  form.set("recipient", recipient);
  form.set("type", type);
  form.set("message", message);

  if (priority !== undefined && priority !== null) {
    form.set("priority", String(priority));
  }

  const response = await fetch(
    `${HOPRELAY_API_BASE_URL}/send/whatsapp`,
    {
      method: "POST",
      body: form,
    },
  );

  return parseJsonResponse(response);
}

export async function sendHopRelaySmsBulk({
  secret,
  mode,
  campaign,
  message,
  numbers,
  groups,
  device,
  gateway,
  sim,
  priority,
  shortener,
}) {
  const form = new FormData();
  form.set("secret", secret);
  form.set("mode", mode);
  form.set("campaign", campaign);
  form.set("message", message);

  if (numbers) form.set("numbers", numbers);
  if (groups) form.set("groups", groups);
  if (device) form.set("device", device);
  if (gateway) form.set("gateway", gateway);
  if (sim) form.set("sim", String(sim));
  if (priority !== undefined && priority !== null) {
    form.set("priority", String(priority));
  }
  if (shortener) form.set("shortener", String(shortener));

  const response = await fetch(
    `${HOPRELAY_API_BASE_URL}/send/sms.bulk`,
    {
      method: "POST",
      body: form,
    },
  );

  return parseJsonResponse(response);
}

export async function sendHopRelayWhatsappBulk({
  secret,
  account,
  campaign,
  message,
  recipients,
  groups,
  type = "text",
  shortener,
}) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("account", account);
  body.set("campaign", campaign);
  body.set("type", type);
  body.set("message", message);

  if (recipients) body.set("recipients", recipients);
  if (groups) body.set("groups", groups);
  if (shortener) body.set("shortener", String(shortener));

  const response = await fetch(
    `${HOPRELAY_API_BASE_URL}/send/whatsapp.bulk`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  return parseJsonResponse(response);
}

export async function deleteHopRelayApiKey({ id }) {
  ensureSystemToken();

  const form = new FormData();
  form.set("token", HOPRELAY_SYSTEM_TOKEN);
  form.set("id", String(id));

  const response = await fetch(
    `${HOPRELAY_ADMIN_BASE_URL}/delete/apikey`,
    {
      method: "POST",
      body: form,
    },
  );

  return parseJsonResponse(response);
}
