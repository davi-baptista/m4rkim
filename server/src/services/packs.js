import { prisma } from '../db.js'
import { config } from '../config.js'
import { dayKey, serialPrefix } from '../utils.js'
import { CARDS_DB } from '../../../src/config/cards.js'

const RARITY = { COMMON: 'common', SILVER: 'silver', GOLD: 'gold' }
const MISSION = { SHARE_GOLD: 'SHARE_GOLD' }

// ─── Probabilidades de raridade ───────────────────────────────────────────────
function rarityRoll() {
  const n = Math.random()
  if (n < 0.03) return RARITY.GOLD
  if (n < 0.16) return RARITY.SILVER
  return RARITY.COMMON
}

// ─── Seleciona um StickerType aleatório ───────────────────────────────────────
// Só sorteia entre slots que tenham arte definida no CARDS_DB do frontend.
// Slots sem entrada em CARDS_DB ainda não estão prontos para dropar.
const AVAILABLE_SLOTS = Object.keys(CARDS_DB).map(Number)

async function chooseStickerType(tx) {
  if (!AVAILABLE_SLOTS.length) throw new Error('no_cards_defined_in_cards_db')
  const db  = tx ?? prisma
  const slot = AVAILABLE_SLOTS[Math.floor(Math.random() * AVAILABLE_SLOTS.length)]
  const row  = await db.stickerType.findUnique({ where: { slotNumber: slot } })
  if (!row) throw new Error(`stickerType not found for slot ${slot} — run db:seed`)
  return row
}

// ─── Status diário de packs do usuário ───────────────────────────────────────
export async function getPackStatus(userId) {
  const today = dayKey()
  const [opened, user] = await Promise.all([
    prisma.packOpen.count({ where: { userId, dayKey: today } }),
    prisma.user.findUnique({ where: { id: userId }, select: { goldShareBonusClaimed: true } }),
  ])
  const missionBonus = user?.goldShareBonusClaimed ? 1 : 0
  const totalAllowed = config.baseDailyPacks + missionBonus
  return {
    dayKey: today,
    baseDaily: config.baseDailyPacks,
    missionBonus,
    opened,
    available: Math.max(0, totalAllowed - opened),
    totalAllowed,
  }
}

// ─── Revalida álbum completo (nunca confia em cache) ─────────────────────────
async function recomputeAlbumComplete(userId) {
  const [collected, totalSlots] = await Promise.all([
    prisma.stickerInstance.groupBy({ by: ['stickerTypeId'], where: { ownerId: userId } }),
    prisma.stickerType.count(),
  ])
  const completed = collected.length >= totalSlots && totalSlots > 0
  await prisma.user.update({ where: { id: userId }, data: { albumCompleted: completed } })
  return { completed, filledSlots: collected.length, totalSlots }
}

// ─── Abre um pack ─────────────────────────────────────────────────────────────
// Anti race condition — tanto o check de limite quanto a criação do PackOpen
// ficam dentro da mesma transação serializada no PostgreSQL. Se dois requests
// chegarem ao mesmo tempo, apenas um vai conseguir criar o PackOpen dentro
// do limite — o outro receberá "daily_limit_reached".
//
// Para cartas raras: a unique constraint @@unique([stickerTypeId, rarity, copyNumber])
// garante que o mesmo número nunca é emitido duas vezes. Se estourar (P2002),
// a carta é rebaixada para common automaticamente.
export async function openPack(userId) {
  // Sorteio fora da transação (operação sem efeito colateral no DB)
  const desiredRarity = rarityRoll()

  let created
  try {
    created = await prisma.$transaction(async (tx) => {
      // ── Check de limite DENTRO da transação ──────────────────────────────────
      const today = dayKey()
      const [openedToday, user] = await Promise.all([
        tx.packOpen.count({ where: { userId, dayKey: today } }),
        tx.user.findUnique({ where: { id: userId }, select: { goldShareBonusClaimed: true } }),
      ])
      const missionBonus = user?.goldShareBonusClaimed ? 1 : 0
      const totalAllowed = config.baseDailyPacks + missionBonus

      if (openedToday >= totalAllowed) {
        // Lança erro para abortar a transação e sinalizar ao caller
        const err = new Error('daily_limit_reached')
        err.code = 'DAILY_LIMIT'
        throw err
      }

      // ── Escolher carta e raridade ─────────────────────────────────────────
      const stickerType = await chooseStickerType(tx)
      // Slot tem raridade só se tiver imagem silver definida em cards.js
      const def         = CARDS_DB[stickerType.slotNumber]
      const hasRarities = !!(def?.images?.silver)
      const finalRarity = hasRarities ? desiredRarity : RARITY.COMMON
      return _buildInstance(tx, userId, stickerType.id, finalRarity, today)
    })
  } catch (err) {
    if (err.code === 'DAILY_LIMIT') {
      return { error: 'daily_limit_reached', status: await getPackStatus(userId) }
    }
    throw err
  }

  const [album, newStatus] = await Promise.all([
    recomputeAlbumComplete(userId),
    getPackStatus(userId),
  ])

  return {
    pack: {
      id: created.id,
      serial: created.serial,
      rarity: created.rarity,
      copyNumber: created.copyNumber,
      totalCopies: created.totalCopies,
      slotNumber: created.stickerType.slotNumber,
      artistName: created.stickerType.artistName,
    },
    album,
    status: newStatus,
  }
}

// ─── Cria a instância da carta dentro da transação ────────────────────────────
async function _buildInstance(tx, userId, stickerTypeId, rarity, packDayKey) {
  // Determina copyNumber para cartas raras
  let copyNumber = null
  let totalCopies = null

  if (rarity !== RARITY.COMMON) {
    const maxCopies = rarity === RARITY.GOLD ? config.goldCopiesPerSlot : config.silverCopiesPerSlot
    const current = await tx.stickerInstance.count({ where: { stickerTypeId, rarity } })

    if (current >= maxCopies) {
      // Cópias esgotadas — rebaixa para common
      rarity = RARITY.COMMON
    } else {
      copyNumber = current + 1
      totalCopies = maxCopies
    }
  }

  // Cria instância com serial temporário (id ainda não existe)
  const instance = await tx.stickerInstance.create({
    data: {
      serial: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rarity,
      copyNumber,
      totalCopies,
      stickerTypeId,
      ownerId: userId,
    },
  })

  // Atualiza para o serial definitivo baseado no id gerado
  const serial = `FIG-${serialPrefix(rarity)}-${instance.id.slice(-8).toUpperCase()}`
  const updated = await tx.stickerInstance.update({
    where: { id: instance.id },
    data: { serial },
    include: { stickerType: true },
  })

  await tx.packOpen.create({
    data: { userId, dayKey: packDayKey, stickerInstanceId: updated.id },
  })

  return updated
}

// ─── Missão: compartilhar carta dourada → +1 pack bônus ──────────────────────
export async function registerGoldShareAndBonus(userId, stickerInstanceId) {
  const [instance, user] = await Promise.all([
    prisma.stickerInstance.findFirst({ where: { id: stickerInstanceId, ownerId: userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { goldShareBonusClaimed: true } }),
  ])

  if (!instance)                       return { error: 'sticker_not_found' }
  if (instance.rarity !== RARITY.GOLD) return { error: 'only_gold_gives_bonus' }
  if (!user)                           return { error: 'user_not_found' }

  const today = dayKey()
  try {
    await prisma.$transaction(async (tx) => {
      await tx.stickerInstance.update({
        where: { id: instance.id },
        data: { sharedAt: new Date() },
      })
      if (!user.goldShareBonusClaimed) {
        await tx.missionClaim.create({
          data: {
            userId,
            mission: MISSION.SHARE_GOLD,
            dayKey: today,
            metadata: JSON.stringify({ stickerInstanceId, mode: 'first_gold_share_lifetime' }),
          },
        })
        await tx.user.update({
          where: { id: userId },
          data: { goldShareBonusClaimed: true },
        })
      }
    })
  } catch {
    return { error: 'share_register_failed' }
  }

  return {
    ok: true,
    bonusGranted: !user.goldShareBonusClaimed,
    status: await getPackStatus(userId),
  }
}
