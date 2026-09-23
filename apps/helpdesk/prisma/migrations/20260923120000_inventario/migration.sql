-- Inventário de equipamentos e termo de responsabilidade.
--
-- Tudo aditivo: tabelas e tipos novos, mais a coluna opcional notifications.link.
-- Nenhum dado existente é alterado.

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('DESKTOP', 'NOTEBOOK', 'MONITOR', 'PRINTER', 'PHONE', 'TABLET', 'NETWORK', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_USE', 'IN_STOCK', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetEventType" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNED', 'RETURNED', 'STATUS_CHANGED', 'CHECKED', 'PHOTO_ADDED', 'PHOTO_REMOVED', 'TERM_ISSUED', 'TERM_SIGNED', 'TERM_CANCELLED');

-- CreateEnum
CREATE TYPE "TermStatus" AS ENUM ('PENDING', 'SIGNED', 'CANCELLED', 'RETURNED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "link" TEXT;

-- CreateTable
CREATE TABLE "assets" (
    "id" SERIAL NOT NULL,
    "tag" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_STOCK',
    "hostname" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "processor" TEXT,
    "memory" TEXT,
    "storage" TEXT,
    "operatingSystem" TEXT,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "remoteAccess" TEXT,
    "teamId" INTEGER,
    "location" TEXT,
    "assigneeId" INTEGER,
    "purchasedAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "notes" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_photos" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "uploadedById" INTEGER,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_events" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "actorId" INTEGER,
    "type" "AssetEventType" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsibility_terms" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "issuedById" INTEGER,
    "status" "TermStatus" NOT NULL DEFAULT 'PENDING',
    "body" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "signatureImage" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "responsibility_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_tag_key" ON "assets"("tag");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- CreateIndex
CREATE INDEX "assets_teamId_idx" ON "assets"("teamId");

-- CreateIndex
CREATE INDEX "assets_assigneeId_idx" ON "assets"("assigneeId");

-- CreateIndex
CREATE INDEX "asset_photos_assetId_createdAt_idx" ON "asset_photos"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "asset_events_assetId_createdAt_idx" ON "asset_events"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "responsibility_terms_userId_status_idx" ON "responsibility_terms"("userId", "status");

-- CreateIndex
CREATE INDEX "responsibility_terms_assetId_issuedAt_idx" ON "responsibility_terms"("assetId", "issuedAt");

-- CreateIndex
CREATE INDEX "responsibility_terms_status_idx" ON "responsibility_terms"("status");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_photos" ADD CONSTRAINT "asset_photos_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_photos" ADD CONSTRAINT "asset_photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsibility_terms" ADD CONSTRAINT "responsibility_terms_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsibility_terms" ADD CONSTRAINT "responsibility_terms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsibility_terms" ADD CONSTRAINT "responsibility_terms_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

