/**
 * DEV ONLY — Dá uma carta dourada garantida para um usuário.
 *
 * Uso:
 *   node scripts/give-gold.js <email> [slotNumber]
 *
 * Exemplos:
 *   node scripts/give-gold.js davi@email.com        → slot aleatório
 *   node scripts/give-gold.js davi@email.com 1      → slot 1 (M4RKIM)
 */

import { PrismaClient } from '@prisma/client'
import { CARDS_DB }     from '../src/config/cards.js'

const prisma = new PrismaClient()

async function main() {
  const email      = process.argv[2]
  const slotArg    = process.argv[3] ? Number(process.argv[3]) : null

  if (!email) {
    console.error('Uso: node scripts/give-gold.js <email> [slotNumber]')
    process.exit(1)
  }

  // Só slots com imagem gold definida podem receber dourada
  const goldSlots = Object.entries(CARDS_DB)
    .filter(([, def]) => def.images.gold)
    .map(([slot]) => Number(slot))

  if (!goldSlots.length) {
    console.error('Nenhum slot com imagem gold definida em CARDS_DB.')
    process.exit(1)
  }

  const slotNumber = slotArg ?? goldSlots[Math.floor(Math.random() * goldSlots.length)]

  if (!goldSlots.includes(slotNumber)) {
    console.error(`Slot ${slotNumber} não tem imagem gold em CARDS_DB. Slots disponíveis: ${goldSlots.join(', ')}`)
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) { console.error(`Usuário não encontrado: ${email}`); process.exit(1) }

  const stickerType = await prisma.stickerType.findUnique({ where: { slotNumber } })
  if (!stickerType) { console.error(`StickerType slot ${slotNumber} não encontrado. Rodou db:seed?`); process.exit(1) }

  const rarity    = 'gold'
  const maxCopies = 5
  const existing  = await prisma.stickerInstance.count({ where: { stickerTypeId: stickerType.id, rarity } })

  if (existing >= maxCopies) {
    console.error(`Slot ${slotNumber} já tem ${existing}/${maxCopies} cópias douradas emitidas.`)
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

  const serial = `FIG-GOLD-${instance.id.slice(-8).toUpperCase()}`
  await prisma.stickerInstance.update({ where: { id: instance.id }, data: { serial } })

  console.log(`✅  Carta DOURADA criada!`)
  console.log(`    Usuário : ${user.username} (${email})`)
  console.log(`    Slot    : #${String(slotNumber).padStart(2,'0')} — ${stickerType.artistName}`)
  console.log(`    Cópia   : ${copyNumber}/${maxCopies}`)
  console.log(`    Serial  : ${serial}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
