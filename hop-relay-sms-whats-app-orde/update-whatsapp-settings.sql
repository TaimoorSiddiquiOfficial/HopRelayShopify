-- Update HopRelay settings to use WhatsApp
UPDATE "HopRelaySettings"
SET 
  "notificationChannel" = 'whatsapp',
  "defaultWaAccount" = '1763477970c4ca4238a0b923820dcc509a6f75849b691c89d2c58ff',
  "orderCreatedTemplate" = 'Hi {{customer_name}}, we received your order {{order_name}}. Thank you for shopping with us!',
  "orderShippedTemplate" = 'Good news {{customer_name}}! Your order {{order_name}} has been shipped and is on its way.',
  "updatedAt" = NOW()
WHERE shop = 'hoprelayorg.myshopify.com';

-- Verify the update
SELECT 
  "notificationChannel",
  "defaultWaAccount",
  "whatsappEnabled",
  "notifyOrderCreated",
  "notifyOrderShipped",
  "orderCreatedTemplate"
FROM "HopRelaySettings"
WHERE shop = 'hoprelayorg.myshopify.com';
