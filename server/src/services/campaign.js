import { prisma } from '../db.js'

// ─── Status público da campanha ───────────────────────────────────────────────
export async function getCampaignStatus() {
  const campaign = await prisma.campaign.findUnique({ where: { id: 'main' } })
  return {
    prizeClaimed: campaign?.prizeClaimed ?? false,
    winnerUsername: campaign?.winnerUsername ?? null,
    winnerClaimedAt: campaign?.winnerClaimedAt ?? null,
  }
}

// ─── Registrar pedido de resgate do prêmio ────────────────────────────────────
// Apenas cria o PrizeClaimRequest — a confirmação atômica de vencedor
// é feita manualmente pelo admin, que então atualiza a Campaign.
// O controle atômico completo (quem chegou primeiro) ficaria em
// um endpoint admin separado que faz:
//   UPDATE campaign SET prizeClaimed=true WHERE prizeClaimed=false
// com prisma.$executeRaw para garantir atomicidade.
export async function createPrizeClaimRequest(userId, { socialUrl, note }) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.albumCompleted) return { error: 'album_not_completed' }

  const campaign = await prisma.campaign.findUnique({ where: { id: 'main' } })
  if (campaign?.prizeClaimed) {
    return { error: 'prize_already_claimed', winnerUsername: campaign.winnerUsername }
  }

  await prisma.prizeClaimRequest.create({
    data: { userId, socialUrl, note: note ?? null },
  })

  return { ok: true, message: 'Pedido registrado. Validação manual pendente.' }
}
