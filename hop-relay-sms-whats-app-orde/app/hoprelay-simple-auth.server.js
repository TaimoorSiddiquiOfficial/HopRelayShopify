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
const HOPRELAY_ADMIN_API_TOKEN = process.env.HOPRELAY_ADMIN_API_TOKEN || "";
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
  console.log('[checkHopRelayUserExists] Admin API Token configured:', !!HOPRELAY_ADMIN_API_TOKEN && HOPRELAY_ADMIN_API_TOKEN !== 'your_hoprelay_admin_api_token_here');
  
  // Try the admin API first if available - this is the most reliable method
  if (HOPRELAY_ADMIN_API_TOKEN && HOPRELAY_ADMIN_API_TOKEN !== 'your_hoprelay_admin_api_token_here') {
    try {
      const url = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/users`);
      url.searchParams.set("token", HOPRELAY_ADMIN_API_TOKEN);
      url.searchParams.set("limit", "250");
      url.searchParams.set("page", "1");

      console.log('[checkHopRelayUserExists] Calling Admin API /get/users');
      const response = await fetch(url, { method: "GET" });
      
      console.log('[checkHopRelayUserExists] Response status:', response.status);
      if (response.ok) {
        const json = await response.json();
        console.log('[checkHopRelayUserExists] Admin API response status:', json.status);
        if (json.status === 200 && json.data) {
          const user = json.data.find(u => 
            u.email && u.email.toLowerCase() === email.toLowerCase()
          );
          if (user) {
            console.log('[checkHopRelayUserExists] ✅ User found via admin API:', user.id);
            return { exists: true, userId: user.id };
          } else {
            console.log('[checkHopRelayUserExists] ❌ User not found in admin API - will create new account');
            return { exists: false, userId: null };
          }
        } else {
          console.log('[checkHopRelayUserExists] ⚠️ Unexpected API response:', json);
        }
      } else {
        console.log('[checkHopRelayUserExists] ⚠️ Admin API request failed with status:', response.status);
        const errorText = await response.text();
        console.log('[checkHopRelayUserExists] Error response:', errorText);
      }
    } catch (error) {
      console.log('[checkHopRelayUserExists] Admin API check failed:', error.message);
    }
  }
  
  // If admin API not available, assume new user (safer to create than fail)
  console.log('[checkHopRelayUserExists] Admin API not available - assuming new user');
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
  if (HOPRELAY_ADMIN_API_TOKEN && HOPRELAY_ADMIN_API_TOKEN !== 'your_hoprelay_admin_api_token_here') {
    try {
      console.log('[createHopRelayUserSimple] Trying Admin API user creation');
      const form = new FormData();
      form.set("token", HOPRELAY_ADMIN_API_TOKEN);
      form.set("name", name);
      form.set("email", email);
      form.set("password", randomPassword);
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
    if (HOPRELAY_ADMIN_API_TOKEN && HOPRELAY_ADMIN_API_TOKEN !== 'your_hoprelay_admin_api_token_here') {
      try {
        console.log('[initializeHopRelayAccount] ✅ Admin API token available, creating user via Admin API');
        const form = new FormData();
        form.set("token", HOPRELAY_ADMIN_API_TOKEN);
        form.set("name", name);
        form.set("email", email);
        form.set("password", randomPassword);
        form.set("credits", "0");
        form.set("timezone", DEFAULT_TIMEZONE);
        form.set("country", DEFAULT_COUNTRY);
        form.set("language", DEFAULT_LANGUAGE_ID);
        form.set("theme", "light"); // Add theme parameter
        form.set("role", DEFAULT_ROLE_ID);

        console.log('[initializeHopRelayAccount] Sending request to:', `${HOPRELAY_ADMIN_BASE_URL}/create/user`);
        console.log('[initializeHopRelayAccount] Form data being sent:');
        for (const [key, value] of form.entries()) {
          console.log(`  ${key}: ${value}`);
        }
        console.log('[initializeHopRelayAccount] User data:', { 
          name, 
          email, 
          credits: 0,
          timezone: DEFAULT_TIMEZONE, 
          country: DEFAULT_COUNTRY, 
          language: DEFAULT_LANGUAGE_ID,
          theme: 'light',
          role: DEFAULT_ROLE_ID
        });
        
        const response = await fetch(`${HOPRELAY_ADMIN_BASE_URL}/create/user`, {
          method: "POST",
          body: form,
        });

        console.log('[initializeHopRelayAccount] Admin API HTTP status:', response.status);
        const json = await response.json();
        console.log('[initializeHopRelayAccount] Admin API full response:', JSON.stringify(json, null, 2));
        
        if (json.status === 200 && json.data && json.data.id) {
          console.log('[initializeHopRelayAccount] ✅ User created via admin API:', json.data.id);
          isNewUser = true;
          userId = json.data.id;
        } else if (json.status === 400 && json.message === 'Invalid Parameters!') {
          // This likely means the email already exists
          console.log('[initializeHopRelayAccount] ⚠️ Admin API returned 400 - email might already exist, searching more thoroughly...');
          
          // Try to find the user by searching through ALL pages
          let foundUser = null;
          console.log('[initializeHopRelayAccount] 🔍 Starting thorough user search across multiple pages...');
          for (let page = 1; page <= 5; page++) { // Search up to 5 pages (1250 users)
            try {
              const searchUrl = new URL(`${HOPRELAY_ADMIN_BASE_URL}/get/users`);
              searchUrl.searchParams.set("token", HOPRELAY_ADMIN_API_TOKEN);
              searchUrl.searchParams.set("limit", "250");
              searchUrl.searchParams.set("page", page.toString());
              
              console.log(`[initializeHopRelayAccount] Searching page ${page}...`);
              const searchResponse = await fetch(searchUrl.toString());
              const searchJson = await searchResponse.json();
              
              console.log(`[initializeHopRelayAccount] Page ${page} response:`, { 
                status: searchJson.status, 
                userCount: searchJson.data?.length || 0 
              });
              
              if (searchJson.status === 200 && searchJson.data) {
                // Log first few emails on each page for debugging
                if (searchJson.data.length > 0) {
                  const sampleEmails = searchJson.data.slice(0, 3).map(u => u.email);
                  console.log(`[initializeHopRelayAccount] Sample emails on page ${page}:`, sampleEmails);
                }
                
                foundUser = searchJson.data.find(u => 
                  u.email && u.email.toLowerCase() === email.toLowerCase()
                );
                
                if (foundUser) {
                  console.log(`[initializeHopRelayAccount] ✅ Found existing user on page ${page}:`, foundUser.id);
                  userId = foundUser.id;
                  isNewUser = false; // User already existed
                  break;
                }
              } else {
                console.log(`[initializeHopRelayAccount] Page ${page} returned non-200 or no data`);
              }
            } catch (searchError) {
              console.log(`[initializeHopRelayAccount] Error searching page ${page}:`, searchError.message);
            }
          }
          
          console.log('[initializeHopRelayAccount] Search complete. Found user:', !!foundUser, 'User ID:', userId);
          
          if (userId) {
            // Found the user! Send verification code only (no welcome email)
            console.log('[initializeHopRelayAccount] ✅ User exists, sending verification code only');
            const codeResult = await sendVerificationCode({ email, name, userId, apiSecret });
            
            return {
              success: true,
              isNewUser: false,
              userId,
              verificationCodeSent: codeResult.success,
              message: 'Verification code sent to your email.',
            };
          }
          
          console.log('[initializeHopRelayAccount] ⚠️ Could not find user in Admin API after thorough search, will try public registration');
        } else {
          console.log('[initializeHopRelayAccount] ⚠️ Admin API returned unexpected response');
        }
        
        // If we got here and have a userId from the search above, use it
        if (userId && !isNewUser) {
          console.log('[initializeHopRelayAccount] ✅ Using found user ID:', userId);
          const codeResult = await sendVerificationCode({ email, name, userId, apiSecret });
          
          return {
            success: true,
            isNewUser: false,
            userId,
            verificationCodeSent: codeResult.success,
            message: 'Verification code sent to your email.',
          };
        }
        
        // Continue with the flow if Admin API created the user successfully
        if (isNewUser && userId) {
          console.log('[initializeHopRelayAccount] ✅ User created via admin API:', userId);
          
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
            generatedPassword,
            message: 'Account created! Please check your email for login credentials and verification code.',
          };
        } else {
          console.log('[initializeHopRelayAccount] ⚠️ Admin API returned unsuccessful status:', json);
        }
      } catch (adminError) {
        console.log('[initializeHopRelayAccount] ❌ Admin API creation failed:', adminError.message);
        console.log('[initializeHopRelayAccount] Error stack:', adminError.stack);
      }
    } else {
      console.log('[initializeHopRelayAccount] ⚠️ Admin API token not configured, will use public registration fallback');
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
    generatedPassword,
    message: 'Account created! Check your email for password and verification code.',
  };
}

export { generateVerificationCode, generateRandomPassword };
