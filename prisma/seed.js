import { PrismaClient } from '@prisma/client'
import { CARDS_DB } from '../src/config/cards.js'

const prisma = new PrismaClient()

async function main() {
  await prisma.campaign.upsert({
    where: { id: 'main' },
    update: {},
    create: { id: 'main' },
  })

  const slots = Array.from({ length: 30 }, (_, i) => i + 1)
  for (const slot of slots) {
    const def = CARDS_DB[slot]
    await prisma.stickerType.upsert({
      where:  { slotNumber: slot },
      update: {
        artistName: def?.artistName ?? `Artista ${slot}`,
      },
      create: {
        slotNumber: slot,
        artistName: def?.artistName ?? `Artista ${slot}`,
        title:      `Sticker #${String(slot).padStart(2, '0')}`,
        hasSnippet: false,
      },
    })
  }
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
