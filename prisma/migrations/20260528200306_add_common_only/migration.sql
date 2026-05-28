-- AlterTable
ALTER TABLE "StickerType" ADD COLUMN     "commonOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "demoClaimed" BOOLEAN NOT NULL DEFAULT false;
