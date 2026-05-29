/**
 * DEV ONLY — Dá uma carta prata garantida para um usuário.
 *
 * Uso:
 *   node scripts/give-silver.js <email> [slotNumber]
 *
 * Exemplos:
 *   node scripts/give-silver.js davi@email.com        → slot aleatório
 *   node scripts/give-silver.js davi@email.com 1      → slot 1 (M4RKIM)
 */

import { PrismaClient } from '@prisma/client'
import { CARDS_DB }     from '../src/config/cards.js'

const prisma = new PrismaClient()

async function main() {
  const email   = process.argv[2]
  const slotArg = process.argv[3] ? Number(process.argv[3]) : null

  if (!email) {
    console.error('Uso: node scripts/give-silver.js <email> [slotNumber]')
    process.exit(1)
  }

  // Só slots com imagem silver definida podem receber prata
  const silverSlots = Object.entries(CARDS_DB)
    .filter(([, def]) => def.images.silver)
    .map(([slot]) => Number(slot))

  if (!silverSlots.length) {
    console.error('Nenhum slot com imagem silver definida em CARDS_DB.')
    process.exit(1)
  }

  const slotNumber = 4 ?? silverSlots[Math.floor(Math.random() * silverSlots.length)]

  if (!silverSlots.includes(slotNumber)) {
    console.error(`Slot ${slotNumber} não tem imagem silver em CARDS_DB. Slots disponíveis: ${silverSlots.join(', ')}`)
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) { console.error(`Usuário não encontrado: ${email}`); process.exit(1) }

  const stickerType = await prisma.stickerType.findUnique({ where: { slotNumber } })
  if (!stickerType) { console.error(`StickerType slot ${slotNumber} não encontrado. Rodou db:seed?`); process.exit(1) }

  const rarity    = 'silver'
  const maxCopies = 10
  const existing  = await prisma.stickerInstance.count({ where: { stickerTypeId: stickerType.id, rarity } })

  if (existing >= maxCopies) {
    console.error(`Slot ${slotNumber} já tem ${existing}/${maxCopies} cópias prata emitidas.`)
    process.exit(1)
  }

  const copyNumber = existing + 1

  const instance = await prisma.stickerInstance.create({
    data: {
      serial:        `TMP-DEV-${Date.now()}`,
      rarity,
      copyNumber,
      totalCopies:   maxCopies,
      stickerTypeId: stickerType.id,
      ownerId:       user.id,
    },
  })

  const serial = `FIG-SILV-${instance.id.slice(-8).toUpperCase()}`
  await prisma.stickerInstance.update({ where: { id: instance.id }, data: { serial } })

  console.log(`✅  Carta PRATA criada!`)
  console.log(`    Usuário : ${user.username} (${email})`)
  console.log(`    Slot    : #${String(slotNumber).padStart(2,'0')} — ${stickerType.artistName}`)
  console.log(`    Cópia   : ${copyNumber}/${maxCopies}`)
  console.log(`    Serial  : ${serial}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
