-- CreateTable
CREATE TABLE "HopRelaySettings" (
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
    "orderCreatedTemplate" TEXT,
    "orderShippedTemplate" TEXT,
    "orderDeliveredTemplate" TEXT,
    "marketingDefaultChannel" TEXT,
    "marketingDefaultMode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HopRelaySettings_shop_key" ON "HopRelaySettings"("shop");
