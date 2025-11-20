const HOPRELAY_ADMIN_BASE_URL =
  process.env.HOPRELAY_ADMIN_BASE_URL || "https://hoprelay.com/admin";
const HOPRELAY_API_BASE_URL =
  process.env.HOPRELAY_API_BASE_URL || "https://hoprelay.com/api";

const HOPRELAY_ADMIN_API_TOKEN = process.env.HOPRELAY_ADMIN_API_TOKEN || "";
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

async function fetchHopRelayApiWithSecret(endpoint, secret) {
  const apiUrl = `${HOPRELAY_API_BASE_URL}${endpoint}`;

  const form = new FormData();
  form.set("secret", secret);

  const postResponse = await fetch(apiUrl, {
    method: "POST",
    body: form,
  });

  try {
    return await parseJsonResponse(postResponse);
  } catch (error) {
    // Some endpoints might only accept GET. Fall back to GET for compatibility.
    if (postResponse.status !== 405 && postResponse.status !== 404) {
      throw error;
    }

    const url = new URL(apiUrl);
    url.searchParams.set("secret", secret);

    const getResponse = await fetch(url, {
      method: "GET",
    });

    return parseJsonResponse(getResponse);
  }
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
  // Extract base domain from configured web base (or admin fallback)
  const baseUrl = HOPRELAY_WEB_BASE_URL;
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
    const allowedDomains = new Set(["hoprelay.com", "www.hoprelay.com"]);

    // Allow hostnames derived from configured admin/web base URLs
    [HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, ""), HOPRELAY_WEB_BASE_URL].forEach(
      (base) => {
        try {
          const host = new URL(base).hostname;
          if (host) allowedDomains.add(host);
        } catch (e) {
          // ignore invalid base URLs
        }
      },
    );

    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(urlObj.hostname);

    if (!allowedDomains.has(urlObj.hostname)) {
      console.error("SSO URL from unauthorized domain:", urlObj.hostname);
      throw new Error("Invalid SSO URL domain");
    }

    // Enforce HTTPS except for local development hosts
    if (urlObj.protocol !== "https:" && !(isLocalHost && urlObj.protocol === "http:")) {
      console.error("Invalid SSO URL protocol for host:", urlObj.protocol, urlObj.hostname);
      throw new Error("Invalid SSO URL protocol");
    }
  } catch (error) {
    console.error("Invalid SSO URL format:", ssoUrl, error);
    throw new Error("Invalid SSO URL received from server");
  }

  return ssoUrl;
}

export async function getHopRelayPackages() {
  if (!HOPRELAY_ADMIN_API_TOKEN) {
    throw new Error(
      "Missing HOPRELAY_ADMIN_API_TOKEN environment variable for HopRelay admin API.",
    );
  }

  const url = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/packages`);
  url.searchParams.set("token", HOPRELAY_ADMIN_API_TOKEN);
  url.searchParams.set("limit", "10");
  url.searchParams.set("page", "1");

  const response = await fetch(url, {
    method: "GET",
  });

  const json = await parseJsonResponse(response);
  return json.data || [];
}

export async function getHopRelayCredits({ secret }) {
  const json = await fetchHopRelayApiWithSecret("/get/credits", secret);
  return json.data || null;
}

export async function getHopRelaySubscription({ secret }) {
  const json = await fetchHopRelayApiWithSecret("/get/subscription", secret);
  return json.data || null;
}

export async function getHopRelayDevices({ secret }) {
  const json = await fetchHopRelayApiWithSecret("/get/devices", secret);
  return json.data || [];
}

export async function getHopRelayWaAccounts({ secret }) {
  const json = await fetchHopRelayApiWithSecret("/get/wa.accounts", secret);
  return json.data || [];
}

export async function findHopRelayUserByEmail(email) {
  ensureSystemToken();

  const target = String(email || "").toLowerCase();
  console.log('[findHopRelayUserByEmail] Searching for:', target);

  const pageLimit = 250;
  const maxPages = 200; // safety guard to avoid infinite loops

  // Search through multiple pages to find the user
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/users`);
    url.searchParams.set("token", HOPRELAY_SYSTEM_TOKEN);
    url.searchParams.set("limit", String(pageLimit));
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      method: "GET",
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

    // If we got less than the page limit, we've reached the end
    if (users.length < pageLimit) {
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

  // Try using the public registration endpoint first (doesn't require Admin API)
  console.log('[createHopRelayUser] Attempting user creation via public registration endpoint...');
  try {
    const baseUrl = HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");
    const registerForm = new FormData();
    registerForm.set("name", name);
    registerForm.set("email", email);
    registerForm.set("password", password);
    registerForm.set("terms", "1"); // Accept terms
    
    const registerResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      body: registerForm,
      redirect: 'manual', // Don't follow redirects
    });
    
    console.log('[createHopRelayUser] Public registration response status:', registerResponse.status);
    
    // Registration typically returns 302 redirect on success
    if (registerResponse.status === 302 || registerResponse.status === 200) {
      console.log('[createHopRelayUser] Public registration successful, now finding user...');
      
      // Wait a moment for the user to be created
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find the newly created user
      const newUser = await findHopRelayUserByEmail(email);
      if (newUser && newUser.id) {
        console.log('[createHopRelayUser] Found newly created user:', newUser);
        return {
          id: newUser.id,
          email: newUser.email || email,
        };
      }
    }
    
    // If public registration didn't work, try the text response
    const regText = await registerResponse.text();
    console.log('[createHopRelayUser] Public registration response:', regText.substring(0, 200));
  } catch (publicRegError) {
    console.log('[createHopRelayUser] Public registration failed:', publicRegError.message);
  }

  // Fall back to Admin API method
  console.log('[createHopRelayUser] Falling back to Admin API method...');
  const form = new FormData();
  form.set("token", HOPRELAY_SYSTEM_TOKEN);
  form.set("name", name);
  form.set("email", email);
  form.set("password", password);
  form.set("timezone", DEFAULT_TIMEZONE);
  form.set("country", DEFAULT_COUNTRY);
  form.set("language", DEFAULT_LANGUAGE_ID);
  // Optional fields - only send if needed
  // form.set("credits", "0");
  // form.set("theme", "light");
  // form.set("role", DEFAULT_ROLE_ID);

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
      console.log('[createHopRelayUser] Got Invalid Parameters - email likely already exists');
      throw new Error('This email is already registered in HopRelay. Please use the correct password for this account.');
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
  console.log('[verifyHopRelayUserPassword] Verifying password for:', email);
  
  // SECURITY: Verify password by attempting API authentication
  // Try to get user secret key by logging in with credentials
  const apiUrl = `${HOPRELAY_API_BASE_URL}/auth`;
  
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      body: form,
    });
    
    console.log('[verifyHopRelayUserPassword] API auth response status:', response.status);
    
    const json = await parseJsonResponse(response);
    
    console.log('[verifyHopRelayUserPassword] API auth response:', JSON.stringify({
      status: json.status,
      message: json.message,
      hasData: !!json.data,
      hasSecret: json.data && !!json.data.secret
    }));
    
    // Valid credentials return status 200 with user data including secret key
    if (json.status === 200 && json.data && json.data.secret) {
      console.log('[verifyHopRelayUserPassword] Password valid: true (API returned user secret)');
      return true;
    }
    
    console.log('[verifyHopRelayUserPassword] Password valid: false (API did not return user secret)');
    return false;
  } catch (error) {
    console.log('[verifyHopRelayUserPassword] Password valid: false (API auth failed:', error.message + ')');
    return false;
  }
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

  // Check if this is a placeholder user ID (from Admin API permission workaround)
  if (userId === 999999) {
    throw new Error('Cannot create API key automatically due to Admin API permissions. Please create an API key manually in your HopRelay.com dashboard and enter it in the "API Key Management" section below.');
  }

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
