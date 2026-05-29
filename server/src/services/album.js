import { prisma } from '../db.js'

const RANK = { common: 0, silver: 1, gold: 2 }

// ─── Álbum completo do usuário ────────────────────────────────────────────────
// Retorna todos os slots com a versão mais rara que o usuário tem em cada um.
export async function getUserAlbum(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  const [types, owned] = await Promise.all([
    prisma.stickerType.findMany({ orderBy: { slotNumber: 'asc' } }),
    prisma.stickerInstance.findMany({
      where: { ownerId: userId },
      include: { stickerType: true },
      orderBy: { receivedAt: 'asc' },
    }),
  ])

  // Mantém a versão mais rara por slot
  const bySlot = new Map()
  for (const card of owned) {
    const slot = card.stickerType.slotNumber
    const prev = bySlot.get(slot)
    if (!prev || RANK[card.rarity] > RANK[prev.rarity]) bySlot.set(slot, card)
  }

  const slots = types.map((t) => {
    const hit = bySlot.get(t.slotNumber)
    return {
      slotNumber: t.slotNumber,
      filled: Boolean(hit),
      sticker: hit
        ? { id: hit.id, serial: hit.serial, rarity: hit.rarity, copyNumber: hit.copyNumber, totalCopies: hit.totalCopies }
        : null,
    }
  })

  return {
    completed: user.albumCompleted,
    progress: `${slots.filter(s => s.filled).length}/${slots.length}`,
    slots,
  }
}

// ─── Dados públicos de uma carta para og:tags ─────────────────────────────────
// Usada pela rota /carta/:username/:rarity/:slot para gerar o preview social
export async function getPublicCardInfo(username, slotNumber, rarity) {
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return null

  const type = await prisma.stickerType.findUnique({ where: { slotNumber } })
  if (!type) return null

  const instance = await prisma.stickerInstance.findFirst({
    where: { ownerId: user.id, stickerTypeId: type.id, rarity },
    orderBy: { receivedAt: 'desc' },
  })
  if (!instance) return null

  return {
    username: user.username,
    artistName: type.artistName,
    rarity,
    slotNumber,
    copyNumber:  instance.copyNumber,
    totalCopies: instance.totalCopies,
  }
}

// ─── Ranking público (top 50) ─────────────────────────────────────────────────
// Ordena por slots únicos preenchidos. Não expõe emails.
export async function getRanking() {
  const totalSlots = await prisma.stickerType.count()

  // Conta slots únicos por usuário (ignora duplicatas do mesmo slot)
  const grouped = await prisma.stickerInstance.groupBy({
    by: ['ownerId', 'stickerTypeId'],
    _count: true,
  })

  const countByUser = new Map()
  for (const row of grouped) {
    countByUser.set(row.ownerId, (countByUser.get(row.ownerId) ?? 0) + 1)
  }

  const topIds = [...countByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id]) => id)

  if (!topIds.length) return { totalSlots, ranking: [] }

  const users = await prisma.user.findMany({
    where: { id: { in: topIds } },
    select: { id: true, username: true, albumCompleted: true },
  })

  const userMap = new Map(users.map(u => [u.id, u]))

  const ranking = topIds.map((id, idx) => {
    const u = userMap.get(id)
    const filled = countByUser.get(id) ?? 0
    return {
      position: idx + 1,
      username: u?.username ?? '???',
      albumCompleted: u?.albumCompleted ?? false,
      filled,
      total: totalSlots,
      progress: `${filled}/${totalSlots}`,
    }
  })

  return { totalSlots, ranking }
}
