/**
 * DEV ONLY — Reseta o bônus de compartilhamento de carta dourada.
 *
 * O que faz:
 *   1. Define goldShareBonusClaimed = false em todas as contas (ou só na conta indicada)
 *   2. Remove os registros de MissionClaim com mission = 'SHARE_GOLD' correspondentes
 *
 * Uso:
 *   node scripts/reset-share-bonus.js           → reseta TODAS as contas
 *   node scripts/reset-share-bonus.js <email>   → reseta só aquele usuário
 *
 * Exemplos:
 *   node scripts/reset-share-bonus.js
 *   node scripts/reset-share-bonus.js davi@email.com
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MISSION_SHARE_GOLD = 'SHARE_GOLD'

async function main() {
  const email = process.argv[2] ?? null

  if (email) {
    // ── Reset de um único usuário ──────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.error(`Usuário não encontrado: ${email}`)
      process.exit(1)
    }

    const [updatedUser, deletedClaims] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data:  { goldShareBonusClaimed: false },
      }),
      prisma.missionClaim.deleteMany({
        where: { userId: user.id, mission: MISSION_SHARE_GOLD },
      }),
    ])

    console.log(`✅  Bônus resetado para ${updatedUser.username} (${email})`)
    console.log(`    MissionClaims removidos: ${deletedClaims.count}`)

  } else {
    // ── Reset de TODAS as contas ───────────────────────────────────────────
    const affected = await prisma.user.count({ where: { goldShareBonusClaimed: true } })

    if (affected === 0) {
      console.log('ℹ️  Nenhuma conta tem goldShareBonusClaimed = true. Nada a fazer.')
      return
    }

    const [updatedUsers, deletedClaims] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { goldShareBonusClaimed: true },
        data:  { goldShareBonusClaimed: false },
      }),
      prisma.missionClaim.deleteMany({
        where: { mission: MISSION_SHARE_GOLD },
      }),
    ])

    console.log(`✅  Bônus resetado em todas as contas`)
    console.log(`    Usuários atualizados  : ${updatedUsers.count}`)
    console.log(`    MissionClaims removidos: ${deletedClaims.count}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
