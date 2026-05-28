/**
 * Serviço do pack demo — permite que visitantes abram 1 pack (2 cartas) sem cadastro.
 *
 * Segurança:
 *   - O pack demo só dá cartas COMUNS (raras são exclusivas de contas registradas).
 *   - Os dados das cartas ficam embutidos num JWT assinado pelo servidor (claimToken).
 *     O cliente não pode forjar nem alterar o conteúdo.
 *   - O token expira em 24h — após isso não pode mais ser resgatado.
 *   - Cada usuário só resgata o demo UMA VEZ (campo demoClaimed no DB).
 */

import jwt from 'jsonwebtoken'
import { prisma } from '../db.js'
import { config } from '../config.js'
import { dayKey, serialPrefix } from '../utils.js'
import { CARDS_DB } from '../../../src/config/cards.js'

const DEMO_EXPIRY_SECONDS = 24 * 60 * 60
const DEMO_RARITY         = 'common'
const DEMO_PACK_SIZE      = 2

// Slots com arte definida — os únicos que podem dropar
const AVAILABLE_SLOTS = Object.keys(CARDS_DB).map(Number)

// ─── Abre o pack demo (sem autenticação) ─────────────────────────────────────
export async function openDemoPack() {
  if (!AVAILABLE_SLOTS.length) throw new Error('no_cards_defined_in_cards_db')

  // Sorteia DEMO_PACK_SIZE slots diferentes dentre os disponíveis
  const shuffled = [...AVAILABLE_SLOTS].sort(() => Math.random() - 0.5)
  const chosen   = shuffled.slice(0, Math.min(DEMO_PACK_SIZE, shuffled.length))

  const types = await Promise.all(
    chosen.map(slot => prisma.stickerType.findUnique({ where: { slotNumber: slot } }))
  )
  const validTypes = types.filter(Boolean)
  if (!validTypes.length) throw new Error('no_sticker_types_seeded')

  // JWT embute os dados de todas as cartas — assinado pelo servidor, não pode ser modificado
  const claimToken = jwt.sign(
    {
      demo: true,
      cards: validTypes.map(t => ({
        stickerTypeId: t.id,
        slotNumber:    t.slotNumber,
        rarity:        DEMO_RARITY,
      })),
    },
    config.jwtSecret,
    { expiresIn: DEMO_EXPIRY_SECONDS },
  )

  return {
    packs: validTypes.map(t => ({
      slotNumber:  t.slotNumber,
      artistName:  t.artistName,
      rarity:      DEMO_RARITY,
      copyNumber:  null,
      totalCopies: null,
    })),
    claimToken,
    expiresIn: DEMO_EXPIRY_SECONDS,
  }
}

// ─── Resgata o pack demo para um usuário já autenticado ──────────────────────
export async function claimDemoPack(userId, claimToken) {
  // 1. Valida o JWT
  let payload
  try {
    payload = jwt.verify(claimToken, config.jwtSecret)
  } catch {
    return { error: 'invalid_or_expired_claim_token' }
  }

  if (!payload.demo) return { error: 'invalid_claim_token' }

  // Suporte ao formato antigo (token com carta única) e novo (array cards)
  const cardsList = payload.cards ?? [{
    stickerTypeId: payload.stickerTypeId,
    rarity:        payload.rarity ?? DEMO_RARITY,
  }]

  // 2. Garante que o usuário ainda não resgatou o demo
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { demoClaimed: true } })
  if (!user)            return { error: 'user_not_found' }
  if (user.demoClaimed) return { error: 'demo_already_claimed' }

  // 3. Cria todas as cartas e marca o demo como resgatado — transação atômica
  try {
    await prisma.$transaction(async (tx) => {
      const today = dayKey()
      for (const card of cardsList) {
        const instance = await tx.stickerInstance.create({
          data: {
            serial:        `TMP-DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            rarity:        card.rarity,
            copyNumber:    null,
            totalCopies:   null,
            stickerTypeId: card.stickerTypeId,
            ownerId:       userId,
          },
        })
        const serial = `FIG-${serialPrefix(card.rarity)}-${instance.id.slice(-8).toUpperCase()}`
        const updated = await tx.stickerInstance.update({ where: { id: instance.id }, data: { serial } })
        await tx.packOpen.create({ data: { userId, dayKey: today, stickerInstanceId: updated.id } })
      }

      await tx.user.update({ where: { id: userId }, data: { demoClaimed: true } })
    })
  } catch (err) {
    console.error('[demo] claim error:', err)
    return { error: 'claim_failed' }
  }

  return { ok: true }
}
