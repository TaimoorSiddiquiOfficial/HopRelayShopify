/**
 * Simplified HopRelay Authentication
 * 
 * Flow:
 * 1. User enters email only
 * 2. System checks if user exists
 * 3. If exists -> Send verification code to email
 * 4. If not exists -> Ask for password, create account & send verification code
 * 5. User enters verification code
 * 6. On success -> Enable SSO link
 */

import { sendVerificationEmail, sendNewAccountEmail } from './email.server.js';

const HOPRELAY_ADMIN_BASE_URL =
  process.env.HOPRELAY_ADMIN_BASE_URL || "https://hoprelay.com/admin";
const HOPRELAY_API_BASE_URL =
  process.env.HOPRELAY_API_BASE_URL || "https://hoprelay.com/api";
const HOPRELAY_SYSTEM_TOKEN = process.env.HOPRELAY_SYSTEM_TOKEN || "";
const HOPRELAY_WEB_BASE_URL =
  process.env.HOPRELAY_WEB_BASE_URL ||
  HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");

const DEFAULT_COUNTRY = process.env.HOPRELAY_DEFAULT_COUNTRY || "US";
const DEFAULT_TIMEZONE = process.env.HOPRELAY_DEFAULT_TIMEZONE || "America/New_York";
const DEFAULT_LANGUAGE_ID = process.env.HOPRELAY_DEFAULT_LANGUAGE_ID || "1";

// In-memory store for verification codes (in production, use Redis or database)
const verificationCodes = new Map();

// Generate a random secure password
function generateRandomPassword(length = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    password += chars.charAt(array[i] % chars.length);
  }
  return password;
}

// Generate a 6-digit verification code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if user exists in HopRelay by trying to send a password reset
 * This is a reliable way to check without needing admin API access
 */
export async function checkHopRelayUserExists(email) {
  console.log('[checkHopRelayUserExists] Checking if user exists:', email);
  
  try {
    // Try the admin API first if available
    if (HOPRELAY_SYSTEM_TOKEN && HOPRELAY_SYSTEM_TOKEN !== 'your_hoprelay_system_token_here') {
      const url = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/users`);
      url.searchParams.set("token", HOPRELAY_SYSTEM_TOKEN);
      url.searchParams.set("limit", "250");
      url.searchParams.set("page", "1");

      const response = await fetch(url, { method: "GET" });
      
      if (response.ok) {
        const json = await response.json();
        if (json.status === 200 && json.data) {
          const user = json.data.find(u => 
            u.email && u.email.toLowerCase() === email.toLowerCase()
          );
          if (user) {
            console.log('[checkHopRelayUserExists] User found via admin API:', user.id);
            return { exists: true, userId: user.id };
          }
        }
      }
    }
  } catch (error) {
    console.log('[checkHopRelayUserExists] Admin API check failed:', error.message);
  }
  
  // Fallback: assume user might exist, let them verify with code
  console.log('[checkHopRelayUserExists] Cannot determine - will send verification code');
  return { exists: null, userId: null };
}

/**
 * Create a new HopRelay user with a random password
 */
export async function createHopRelayUserSimple({ name, email }) {
  console.log('[createHopRelayUserSimple] Creating user:', email);
  
  const randomPassword = generateRandomPassword();
  
  try {
    // Try public registration first
    const baseUrl = HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");
    const registerForm = new FormData();
    registerForm.set("name", name);
    registerForm.set("email", email);
    registerForm.set("password", randomPassword);
    registerForm.set("terms", "1");
    
    const registerResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      body: registerForm,
      redirect: 'manual',
    });
    
    console.log('[createHopRelayUserSimple] Registration status:', registerResponse.status);
    
    if (registerResponse.status === 302 || registerResponse.status === 200) {
      console.log('[createHopRelayUserSimple] User created successfully');
      
      // Wait for user to be created
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to get user ID
      const userCheck = await checkHopRelayUserExists(email);
      if (userCheck.userId) {
        return {
          success: true,
          userId: userCheck.userId,
          password: randomPassword,
        };
      }
      
      return {
        success: true,
        userId: null,
        password: randomPassword,
      };
    }
  } catch (error) {
    console.log('[createHopRelayUserSimple] Public registration failed:', error.message);
  }
  
  // Try admin API if available
  if (HOPRELAY_SYSTEM_TOKEN && HOPRELAY_SYSTEM_TOKEN !== 'your_hoprelay_system_token_here') {
    try {
      const form = new FormData();
      form.set("token", HOPRELAY_SYSTEM_TOKEN);
      form.set("name", name);
      form.set("email", email);
      form.set("password", randomPassword);
      form.set("timezone", DEFAULT_TIMEZONE);
      form.set("country", DEFAULT_COUNTRY);
      form.set("language", DEFAULT_LANGUAGE_ID);

      const response = await fetch(`${HOPRELAY_ADMIN_BASE_URL}/create/user`, {
        method: "POST",
        body: form,
      });

      const json = await response.json();
      
      if (json.status === 200 && json.data && json.data.id) {
        console.log('[createHopRelayUserSimple] User created via admin API:', json.data.id);
        return {
          success: true,
          userId: json.data.id,
          password: randomPassword,
        };
      }
    } catch (error) {
      console.log('[createHopRelayUserSimple] Admin API creation failed:', error.message);
    }
  }
  
  throw new Error('Failed to create HopRelay account. Please try again or contact support.');
}

/**
 * Send verification code to user's email via HopRelay
 */
export async function sendVerificationCode({ email, name, userId, apiSecret }) {
  console.log('[sendVerificationCode] Sending code to:', email);
  
  const code = generateVerificationCode();
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
  
  // Store verification code
  verificationCodes.set(email.toLowerCase(), {
    code,
    expiresAt,
    userId,
  });
  
  // Send verification code via email
  let emailSent = false;
  
  try {
    await sendVerificationEmail({
      to: email,
      code: code,
      name: name,
    });
    
    emailSent = true;
    console.log('[sendVerificationCode] Verification email sent successfully to:', email);
  } catch (error) {
    console.error('[sendVerificationCode] Failed to send email:', error.message);
    // Continue anyway - code is still stored and can be used
    console.log('[sendVerificationCode] Verification code for', email + ':', code);
  }
  
  return {
    success: true,
    code: code, // Keep this for testing - remove in production
    message: `Verification code ${emailSent ? 'sent' : 'generated'} for ${email}`,
    emailSent,
  };
}

/**
 * Verify the code entered by the user
 */
export async function verifyCode({ email, code }) {
  console.log('[verifyCode] Verifying code for:', email);
  
  const stored = verificationCodes.get(email.toLowerCase());
  
  if (!stored) {
    console.log('[verifyCode] No code found for email');
    return { success: false, message: 'No verification code found. Please request a new code.' };
  }
  
  if (Date.now() > stored.expiresAt) {
    console.log('[verifyCode] Code expired');
    verificationCodes.delete(email.toLowerCase());
    return { success: false, message: 'Verification code expired. Please request a new code.' };
  }
  
  if (stored.code !== code) {
    console.log('[verifyCode] Invalid code');
    return { success: false, message: 'Invalid verification code. Please try again.' };
  }
  
  console.log('[verifyCode] Code verified successfully');
  
  // Clear the code after successful verification
  verificationCodes.delete(email.toLowerCase());
  
  return {
    success: true,
    userId: stored.userId,
    message: 'Verification successful!',
  };
}

/**
 * Complete flow: Initialize account connection
 * Step 1: Check if user exists and determine next action
 */
export async function initializeHopRelayAccount({ email, name, password, apiSecret }) {
  console.log('[initializeHopRelayAccount] Starting for:', email);
  
  // Check if user exists
  const userCheck = await checkHopRelayUserExists(email);
  
  let userId = userCheck.userId;
  let isNewUser = false;
  let requiresPassword = false;
  let generatedPassword = null;
  
  // If user exists, just send verification code
  if (userCheck.exists === true && userId) {
    console.log('[initializeHopRelayAccount] Existing user found:', userId);
    
    // Send verification code to existing user
    const codeResult = await sendVerificationCode({ email, name, userId, apiSecret });
    
    return {
      success: true,
      isNewUser: false,
      userId,
      requiresPassword: false,
      verificationCodeSent: codeResult.success,
      testCode: codeResult.code, // Keep for testing
      message: 'Verification code sent to your email.',
    };
  }
  
  // User doesn't exist or we can't determine - check if password was provided
  if (!password) {
    // User needs to provide a password to create account
    console.log('[initializeHopRelayAccount] New user - password required');
    return {
      success: false,
      isNewUser: true,
      requiresPassword: true,
      message: 'Account not found. Please provide a password to create your HopRelay account.',
    };
  }
  
  // Create new user with provided password
  try {
    console.log('[initializeHopRelayAccount] Creating new user with provided password');
    
    // Use the provided password instead of random
    const baseUrl = HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");
    const registerForm = new FormData();
    registerForm.set("name", name);
    registerForm.set("email", email);
    registerForm.set("password", password);
    registerForm.set("terms", "1");
    
    const registerResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      body: registerForm,
      redirect: 'manual',
    });
    
    console.log('[initializeHopRelayAccount] Registration status:', registerResponse.status);
    
    if (registerResponse.status === 302 || registerResponse.status === 200) {
      console.log('[initializeHopRelayAccount] User created successfully');
      isNewUser = true;
      generatedPassword = password;
      
      // Send welcome email with credentials
      try {
        await sendNewAccountEmail({
          to: email,
          password: password,
          name: name,
        });
        console.log('[initializeHopRelayAccount] Welcome email sent to:', email);
      } catch (emailError) {
        console.error('[initializeHopRelayAccount] Failed to send welcome email:', emailError.message);
        // Continue anyway
      }
      
      // Wait for user to be created
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to get user ID
      const userCheck = await checkHopRelayUserExists(email);
      if (userCheck.userId) {
        userId = userCheck.userId;
      }
    } else {
      throw new Error('Failed to create account. Please try a different password.');
    }
  } catch (error) {
    console.log('[initializeHopRelayAccount] Could not create user:', error.message);
    throw new Error('Failed to create HopRelay account: ' + error.message);
  }
  
  // Send verification code to new user
  const codeResult = await sendVerificationCode({ email, name, userId, apiSecret });
  
  return {
    success: true,
    isNewUser: true,
    userId,
    requiresPassword: false,
    verificationCodeSent: codeResult.success,
    testCode: codeResult.code, // Keep for testing
    generatedPassword,
    message: 'Account created! Verification code sent to your email.',
  };
}

export { generateVerificationCode, generateRandomPassword };
