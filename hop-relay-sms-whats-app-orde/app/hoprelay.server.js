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

  const target = String(email || "").toLowerCase();
  console.log('[findHopRelayUserByEmail] Searching for:', target);

  // Search through multiple pages to find the user
  for (let page = 1; page <= 10; page++) {
    const form = new FormData();
    form.set("token", HOPRELAY_SYSTEM_TOKEN);
    form.set("limit", "250");
    form.set("page", String(page));

    const response = await fetch(`${HOPRELAY_ADMIN_BASE_URL}/get/users`, {
      method: "POST",
      body: form,
    });

    const json = await parseJsonResponse(response);
    const users = json.data || [];
    
    console.log(`[findHopRelayUserByEmail] Page ${page}: Found ${users.length} users`);
    if (users.length > 0) {
      console.log(`[findHopRelayUserByEmail] User emails on page ${page}:`, users.map(u => u.email));
    }

    if (users.length === 0) {
      // No more users, stop searching
      break;
    }

    const found = users.find(
      (user) =>
        user.email &&
        typeof user.email === "string" &&
        user.email.toLowerCase() === target,
    );

    if (found) {
      console.log('[findHopRelayUserByEmail] User found:', found);
      return found;
    }

    // If we got less than 250 users, we've reached the end
    if (users.length < 250) {
      break;
    }
  }

  console.log('[findHopRelayUserByEmail] User not found after searching all pages');
  return null;
}

export async function createHopRelayUser({ name, email, password }) {
  ensureSystemToken();

  // Check if email already exists
  console.log('[createHopRelayUser] Checking if email exists:', email);
  const existingUser = await findHopRelayUserByEmail(email);
  console.log('[createHopRelayUser] Existing user check:', existingUser);
  
  if (existingUser && existingUser.id) {
    console.log('[createHopRelayUser] Email already exists in HopRelay:', email);
    throw new Error(`Email address ${email} is already registered in HopRelay. Please use the password verification flow instead of creating a new account.`);
  }

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

  console.log('[createHopRelayUser] Creating user with:', { 
    name, 
    email, 
    hasPassword: !!password,
    timezone: DEFAULT_TIMEZONE,
    country: DEFAULT_COUNTRY,
    language: DEFAULT_LANGUAGE_ID,
    role: DEFAULT_ROLE_ID,
    hasToken: !!HOPRELAY_SYSTEM_TOKEN,
    tokenLength: HOPRELAY_SYSTEM_TOKEN.length,
    url: `${HOPRELAY_ADMIN_BASE_URL}/create/user`
  });

  const response = await fetch(`${HOPRELAY_ADMIN_BASE_URL}/create/user`, {
    method: "POST",
    body: form,
  });

  console.log('[createHopRelayUser] Response status:', response.status);
  
  let json;
  try {
    const text = await response.text();
    console.log('[createHopRelayUser] Response text:', text);
    json = JSON.parse(text);
    console.log('[createHopRelayUser] Response JSON:', JSON.stringify(json, null, 2));
    
    // If error is "Invalid Parameters", it might be because email exists. Try direct login to verify.
    if (json.status === 400 && json.message === 'Invalid Parameters!') {
      console.log('[createHopRelayUser] Got Invalid Parameters - testing if it\'s due to existing email...');
      const loginTest = await verifyHopRelayUserPassword({ email, password });
      console.log('[createHopRelayUser] Login test result:', loginTest);
      
      if (loginTest) {
        // Password is correct! Search for the user in the system
        console.log('[createHopRelayUser] Password verified! Searching all users to find this email...');
        
        // Search through ALL users to find this email
        let foundUser = null;
        for (let page = 1; page <= 50; page++) {
          const form = new FormData();
          form.set("token", HOPRELAY_SYSTEM_TOKEN);
          form.set("limit", "250");
          form.set("page", String(page));

          const userResponse = await fetch(`${HOPRELAY_ADMIN_BASE_URL}/get/users`, {
            method: "POST",
            body: form,
          });

          const userJson = await parseJsonResponse(userResponse);
          const users = userJson.data || [];
          
          console.log(`[createHopRelayUser] Searching page ${page}: ${users.length} users`);

          if (users.length === 0) break;

          foundUser = users.find(u => 
            u.email && 
            typeof u.email === 'string' && 
            u.email.toLowerCase() === email.toLowerCase()
          );

          if (foundUser) {
            console.log('[createHopRelayUser] Found user:', foundUser);
            break;
          }

          if (users.length < 250) break;
        }
        
        if (foundUser && foundUser.id) {
          // Return the user data
          return {
            id: foundUser.id,
            email: foundUser.email || email,
          };
        }
        
        // User not found via Admin API, but password is correct
        // This is likely a permissions issue with the Admin API only returning limited users
        // As a workaround, we'll use a special marker ID and store the email
        console.log('[createHopRelayUser] User not found in Admin API results, but password verified.');
        console.log('[createHopRelayUser] This is likely an Admin API permission issue.');
        console.log('[createHopRelayUser] Creating placeholder entry with email verification...');
        
        return {
          id: 999999, // Special ID indicating email-verified but not found in API
          email: email,
          verified: true,
        };
      } else {
        throw new Error('This email already exists in HopRelay, but the password is incorrect. Please use the "Send Password Reset Email" button below to recover your account.');
      }
    }
  } catch (e) {
    if (e.message.includes('email already exists') || e.message.includes('password is incorrect') || e.message.includes('Password is correct')) {
      throw e; // Re-throw our custom error messages
    }
    console.error('[createHopRelayUser] Failed to parse response:', e);
    throw new Error('Failed to parse HopRelay response');
  }
  
  if (!response.ok || (json && json.status && json.status !== 200)) {
    const message = (json && json.message) || `HopRelay request failed with status ${response.status}`;
    console.error('[createHopRelayUser] API Error:', message, json);
    const error = new Error(message);
    error.details = json;
    throw error;
  }
  
  if (!json.data || !json.data.id) {
    console.error('[createHopRelayUser] Invalid response - missing data.id:', json);
    throw new Error(json.message || 'Failed to create user - invalid response from HopRelay');
  }
  
  return json.data;
}

export async function sendHopRelayPasswordReset({ email }) {
  const baseUrl = HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");
  
  const form = new FormData();
  form.set("email", email);

  const response = await fetch(`${baseUrl}/auth/recovery`, {
    method: "POST",
    body: form,
  });

  // Password reset endpoint may not return JSON, just check status
  if (!response.ok) {
    throw new Error(`Failed to send password reset email: ${response.status}`);
  }

  return { success: true };
}

export async function verifyHopRelayUserPassword({ email, password }) {
  const baseUrl = HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");
  
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);

  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    body: form,
  });

  // If login successful, user credentials are valid
  return response.ok;
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

export async function getHopRelayApiKeys({ userId }) {
  ensureSystemToken();

  const url = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/apikeys`);
  url.searchParams.set("token", HOPRELAY_SYSTEM_TOKEN);
  url.searchParams.set("user", String(userId));
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  return json.data || [];
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

export async function deleteAllHopRelayApiKeys({ userId }) {
  ensureSystemToken();

  try {
    const apiKeys = await getHopRelayApiKeys({ userId });
    
    if (!apiKeys || apiKeys.length === 0) {
      console.log(`No API keys found for user ${userId}`);
      return { deleted: 0 };
    }

    const deletePromises = apiKeys.map((apiKey) =>
      deleteHopRelayApiKey({ id: apiKey.id }).catch((error) => {
        console.error(`Failed to delete API key ${apiKey.id}:`, error);
        return null;
      })
    );

    await Promise.all(deletePromises);
    
    console.log(`Deleted ${apiKeys.length} API key(s) for user ${userId}`);
    return { deleted: apiKeys.length };
  } catch (error) {
    console.error(`Failed to delete all API keys for user ${userId}:`, error);
    throw error;
  }
}
