-- AlterTable
ALTER TABLE "HopRelaySettings" ADD COLUMN "notifyOrderCreated" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "HopRelaySettings" ADD COLUMN "notifyOrderShipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HopRelaySettings" ADD COLUMN "notifyOrderDelivered" BOOLEAN NOT NULL DEFAULT false;
