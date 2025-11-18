-- CreateTable
CREATE TABLE "HopRelaySettings" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HopRelaySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HopRelaySettings_shop_key" ON "HopRelaySettings"("shop");
