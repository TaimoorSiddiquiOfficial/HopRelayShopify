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
const DEFAULT_ROLE_ID = process.env.HOPRELAY_DEFAULT_ROLE_ID || "2";

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
            console.log('[checkHopRelayUserExists] ✅ User found via admin API:', user.id);
            return { exists: true, userId: user.id };
          } else {
            console.log('[checkHopRelayUserExists] ❌ User not found in admin API results');
            return { exists: false, userId: null };
          }
        }
      }
    }
  } catch (error) {
    console.log('[checkHopRelayUserExists] Admin API check failed:', error.message);
  }
  
  // Fallback: Try password reset to check if email exists
  try {
    const baseUrl = HOPRELAY_ADMIN_BASE_URL.replace(/\/admin\/?$/, "");
    const resetForm = new FormData();
    resetForm.set("email", email);
    
    const response = await fetch(`${baseUrl}/auth/recovery`, {
      method: "POST",
      body: resetForm,
      redirect: 'manual',
    });
    
    // If password reset succeeds, user exists
    if (response.status === 302 || response.status === 200) {
      console.log('[checkHopRelayUserExists] ✅ User exists (password reset accepted)');
      return { exists: true, userId: null };
    }
  } catch (error) {
    console.log('[checkHopRelayUserExists] Password reset check failed:', error.message);
  }
  
  // Cannot determine - assume new user
  console.log('[checkHopRelayUserExists] Cannot determine - assuming new user');
  return { exists: false, userId: null };
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
    console.log('[sendVerificationCode] Attempting to send email via service:', process.env.EMAIL_SERVICE || 'console');
    
    await sendVerificationEmail({
      to: email,
      code: code,
      name: name,
    });
    
    emailSent = true;
    console.log('[sendVerificationCode] ✅ Verification email sent successfully to:', email);
  } catch (error) {
    console.error('[sendVerificationCode] ❌ Failed to send email:', error.message);
    console.error('[sendVerificationCode] Full error:', error);
    // Continue anyway - code is still stored and can be used
    console.log('[sendVerificationCode] 📧 Verification code for', email + ':', code);
  }
  
  return {
    success: true,
    code: code, // Keep this for testing - remove in production
    message: `Verification code ${emailSent ? 'sent to your email' : 'generated (check server logs)'}`,
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
export async function initializeHopRelayAccount({ email, name, apiSecret }) {
  console.log('[initializeHopRelayAccount] Starting for:', email);
  
  // Check if user exists
  const userCheck = await checkHopRelayUserExists(email);
  
  let userId = userCheck.userId;
  let isNewUser = false;
  let generatedPassword = null;
  
  // If user EXISTS, just send verification code (NO password generation)
  if (userCheck.exists === true) {
    console.log('[initializeHopRelayAccount] ✅ Existing user found, sending verification code only');
    
    // Send verification code to existing user (NO password email)
    const codeResult = await sendVerificationCode({ email, name, userId, apiSecret });
    
    return {
      success: true,
      isNewUser: false,
      userId,
      verificationCodeSent: codeResult.success,
      testCode: codeResult.code, // Keep for testing
      message: 'Verification code sent to your email.',
    };
  }
  
  // User DOESN'T exist - create NEW account with auto-generated password
  console.log('[initializeHopRelayAccount] 🆕 New user - generating random password');
  
  // Generate a secure random password (min 8 chars for HopRelay)
  const randomPassword = generateRandomPassword(20);
  generatedPassword = randomPassword;
  
  // Create new user with auto-generated password
  try {
    console.log('[initializeHopRelayAccount] Creating new user with auto-generated password');
    
    // Try admin API first if available (more reliable)
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
        form.set("role", "2"); // Regular user role

        const response = await fetch(`${HOPRELAY_ADMIN_BASE_URL}/create/user`, {
          method: "POST",
          body: form,
        });

        const json = await response.json();
        console.log('[initializeHopRelayAccount] Admin API response:', json);
        
        if (json.status === 200 && json.data && json.data.id) {
          console.log('[initializeHopRelayAccount] ✅ User created via admin API:', json.data.id);
          isNewUser = true;
          userId = json.data.id;
          
          // Send welcome email with auto-generated password
          try {
            await sendNewAccountEmail({
              to: email,
              password: randomPassword,
              name: name,
            });
            console.log('[initializeHopRelayAccount] ✅ Welcome email with password sent to:', email);
          } catch (emailError) {
            console.error('[initializeHopRelayAccount] ❌ Failed to send welcome email:', emailError.message);
            console.log('[initializeHopRelayAccount] 🔑 Generated password for', email + ':', randomPassword);
          }
          
          // Send verification code
          const codeResult = await sendVerificationCode({ email, name, userId, apiSecret });
          
          return {
            success: true,
            isNewUser: true,
            userId,
            verificationCodeSent: codeResult.success,
            testCode: codeResult.code,
            generatedPassword,
            message: 'Account created! Check your email for password and verification code.',
          };
        }
      } catch (adminError) {
        console.log('[initializeHopRelayAccount] Admin API creation failed:', adminError.message);
      }
    }
    
    // Fallback to public registration
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
    
    console.log('[initializeHopRelayAccount] Registration status:', registerResponse.status);
    
    if (registerResponse.status === 302 || registerResponse.status === 200) {
      console.log('[initializeHopRelayAccount] User created successfully with random password');
      isNewUser = true;
      
      // Send welcome email with auto-generated password
      try {
        await sendNewAccountEmail({
          to: email,
          password: randomPassword,
          name: name,
        });
        console.log('[initializeHopRelayAccount] ✅ Welcome email with password sent to:', email);
      } catch (emailError) {
        console.error('[initializeHopRelayAccount] ❌ Failed to send welcome email:', emailError.message);
        console.log('[initializeHopRelayAccount] 🔑 Generated password for', email + ':', randomPassword);
        // Continue anyway - password will be shown in UI
      }
      
      // Wait for user to be created
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Try to get user ID from HopRelay
      const newUserCheck = await checkHopRelayUserExists(email);
      if (newUserCheck.userId) {
        userId = newUserCheck.userId;
        console.log('[initializeHopRelayAccount] ✅ Retrieved user ID:', userId);
      } else {
        console.log('[initializeHopRelayAccount] ⚠️ Could not retrieve user ID, will use placeholder');
      }
    } else {
      throw new Error('Failed to create account. Please try again later.');
    }
  } catch (error) {
    console.log('[initializeHopRelayAccount] ❌ Could not create user:', error.message);
    throw new Error('Failed to create HopRelay account: ' + error.message);
  }
  
  // Send verification code to new user
  const codeResult = await sendVerificationCode({ email, name, userId, apiSecret });
  
  return {
    success: true,
    isNewUser: true,
    userId,
    verificationCodeSent: codeResult.success,
    testCode: codeResult.code, // Keep for testing
    generatedPassword,
    message: 'Account created! Check your email for password and verification code.',
  };
}

export { generateVerificationCode, generateRandomPassword };
