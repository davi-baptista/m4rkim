-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "albumCompleted" BOOLEAN NOT NULL DEFAULT false,
    "goldShareBonusClaimed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "startsAt" TIMESTAMP(3),
    "launchAt" TIMESTAMP(3),
    "prizeClaimed" BOOLEAN NOT NULL DEFAULT false,
    "winnerUserId" TEXT,
    "winnerUsername" TEXT,
    "winnerClaimedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerType" (
    "id" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "artistName" TEXT NOT NULL,
    "title" TEXT,
    "hasSnippet" BOOLEAN NOT NULL DEFAULT false,
    "snippetUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StickerType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerInstance" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "copyNumber" INTEGER,
    "totalCopies" INTEGER,
    "stickerTypeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedAt" TIMESTAMP(3),

    CONSTRAINT "StickerInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackOpen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stickerInstanceId" TEXT NOT NULL,

    CONSTRAINT "PackOpen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "MissionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeClaimRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "socialUrl" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "PrizeClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "StickerType_slotNumber_key" ON "StickerType"("slotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StickerInstance_serial_key" ON "StickerInstance"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "StickerInstance_stickerTypeId_rarity_copyNumber_key" ON "StickerInstance"("stickerTypeId", "rarity", "copyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PackOpen_stickerInstanceId_key" ON "PackOpen"("stickerInstanceId");

-- CreateIndex
CREATE INDEX "PackOpen_userId_dayKey_idx" ON "PackOpen"("userId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "MissionClaim_userId_mission_dayKey_key" ON "MissionClaim"("userId", "mission", "dayKey");

-- AddForeignKey
ALTER TABLE "StickerInstance" ADD CONSTRAINT "StickerInstance_stickerTypeId_fkey" FOREIGN KEY ("stickerTypeId") REFERENCES "StickerType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerInstance" ADD CONSTRAINT "StickerInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpen" ADD CONSTRAINT "PackOpen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpen" ADD CONSTRAINT "PackOpen_stickerInstanceId_fkey" FOREIGN KEY ("stickerInstanceId") REFERENCES "StickerInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionClaim" ADD CONSTRAINT "MissionClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaimRequest" ADD CONSTRAINT "PrizeClaimRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
