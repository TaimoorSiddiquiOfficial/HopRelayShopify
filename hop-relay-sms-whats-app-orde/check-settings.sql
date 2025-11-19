-- Query to check HopRelay settings
SELECT 
  "notificationChannel",
  "defaultWaAccount",
  "defaultSmsDeviceId",
  "defaultSmsMode",
  "orderCreatedTemplate",
  "orderShippedTemplate",
  "whatsappEnabled",
  "smsEnabled"
FROM "HopRelaySettings"
WHERE shop = 'hoprelayorg.myshopify.com';
