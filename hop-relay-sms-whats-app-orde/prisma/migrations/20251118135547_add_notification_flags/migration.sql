-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HopRelaySettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "hoprelayUserId" INTEGER,
    "hoprelayUserEmail" TEXT,
    "hoprelayApiKeyId" INTEGER,
    "hoprelayApiKeyName" TEXT,
    "hoprelayApiSecret" TEXT,
    "hoprelayPackageId" INTEGER,
    "hoprelayPlanName" TEXT,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyOrderCreated" BOOLEAN NOT NULL DEFAULT true,
    "notifyOrderShipped" BOOLEAN NOT NULL DEFAULT false,
    "notifyOrderDelivered" BOOLEAN NOT NULL DEFAULT false,
    "orderCreatedTemplate" TEXT,
    "orderShippedTemplate" TEXT,
    "orderDeliveredTemplate" TEXT,
    "marketingDefaultChannel" TEXT,
    "marketingDefaultMode" TEXT,
    "defaultSmsMode" TEXT,
    "defaultSmsDeviceId" TEXT,
    "defaultSmsSim" INTEGER,
    "defaultWaAccount" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_HopRelaySettings" ("createdAt", "defaultSmsDeviceId", "defaultSmsMode", "defaultSmsSim", "defaultWaAccount", "hoprelayApiKeyId", "hoprelayApiKeyName", "hoprelayApiSecret", "hoprelayPackageId", "hoprelayPlanName", "hoprelayUserEmail", "hoprelayUserId", "id", "marketingDefaultChannel", "marketingDefaultMode", "orderCreatedTemplate", "orderDeliveredTemplate", "orderShippedTemplate", "shop", "smsEnabled", "updatedAt", "whatsappEnabled") SELECT "createdAt", "defaultSmsDeviceId", "defaultSmsMode", "defaultSmsSim", "defaultWaAccount", "hoprelayApiKeyId", "hoprelayApiKeyName", "hoprelayApiSecret", "hoprelayPackageId", "hoprelayPlanName", "hoprelayUserEmail", "hoprelayUserId", "id", "marketingDefaultChannel", "marketingDefaultMode", "orderCreatedTemplate", "orderDeliveredTemplate", "orderShippedTemplate", "shop", "smsEnabled", "updatedAt", "whatsappEnabled" FROM "HopRelaySettings";
DROP TABLE "HopRelaySettings";
ALTER TABLE "new_HopRelaySettings" RENAME TO "HopRelaySettings";
CREATE UNIQUE INDEX "HopRelaySettings_shop_key" ON "HopRelaySettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
