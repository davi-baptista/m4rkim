/**
 * Rotas da API — apenas coordenação HTTP.
 * Toda lógica de negócio fica nos services/.
 */

import express from 'express'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { registerUser, loginUser, getMe } from './services/auth.js'
import { openDemoPack, claimDemoPack }    from './services/demo.js'
import { getPackStatus, openPack, registerGoldShareAndBonus } from './services/packs.js'
import { getUserAlbum, getRanking, getPublicCardInfo } from './services/album.js'
import { getCampaignStatus, createPrizeClaimRequest } from './services/campaign.js'

export const router = express.Router()

// Helper: captura erros async e encaminha pro error handler global
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ ok: true }))

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', wrap(async (req, res) => {
  const schema = z.object({
    email:      z.string().email(),
    username:   z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    password:   z.string().min(6),
    claimToken: z.string().optional(),  // token do pack demo, se houver
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })

  const result = await registerUser(parsed.data)
  if (result.error) return res.status(409).json(result)
  return res.status(201).json(result)
}))

router.post('/auth/login', wrap(async (req, res) => {
  const schema = z.object({
    email:    z.string().email(),
    password: z.string().min(1),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })

  const result = await loginUser(parsed.data)
  if (result.error) return res.status(401).json(result)
  return res.json(result)
}))

router.get('/me', requireAuth, wrap(async (req, res) => {
  const user = await getMe(req.user.sub)
  if (!user) return res.status(404).json({ error: 'user_not_found' })
  return res.json(user)
}))

// ─── Pack demo (sem autenticação) ────────────────────────────────────────────
// Abre 1 pack common para visitantes — retorna dados + claimToken assinado (24h)
router.post('/packs/demo', wrap(async (_req, res) => {
  const result = await openDemoPack()
  return res.status(201).json(result)
}))

// Resgata o pack demo para o usuário logado (após criar conta ou fazer login)
router.post('/packs/demo/claim', requireAuth, wrap(async (req, res) => {
  const schema = z.object({ claimToken: z.string().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })

  const result = await claimDemoPack(req.user.sub, parsed.data.claimToken)
  if (result.error) return res.status(400).json(result)
  return res.json(result)
}))

// ─── Packs ────────────────────────────────────────────────────────────────────
router.get('/packs/status', requireAuth, wrap(async (req, res) => {
  return res.json(await getPackStatus(req.user.sub))
}))

router.post('/packs/open', requireAuth, wrap(async (req, res) => {
  const result = await openPack(req.user.sub)
  if (result.error) return res.status(429).json(result)
  return res.status(201).json(result)
}))

// ─── Compartilhamento ─────────────────────────────────────────────────────────
router.post('/shares/gold', requireAuth, wrap(async (req, res) => {
  const schema = z.object({ slotNumber: z.number().int().positive() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })

  const result = await registerGoldShareAndBonus(req.user.sub, parsed.data.slotNumber)
  if (result.error) return res.status(400).json(result)
  return res.json(result)
}))

// ─── Álbum ────────────────────────────────────────────────────────────────────
router.get('/album', requireAuth, wrap(async (req, res) => {
  const album = await getUserAlbum(req.user.sub)
  if (!album) return res.status(404).json({ error: 'user_not_found' })
  return res.json(album)
}))

// ─── Ranking (público) ────────────────────────────────────────────────────────
router.get('/ranking', wrap(async (_req, res) => {
  return res.json(await getRanking())
}))

// ─── Campanha ─────────────────────────────────────────────────────────────────
router.get('/campaign/status', wrap(async (_req, res) => {
  return res.json(await getCampaignStatus())
}))

router.post('/campaign/claim-prize-request', requireAuth, wrap(async (req, res) => {
  const schema = z.object({
    socialUrl: z.string().url(),
    note: z.string().max(400).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })

  const result = await createPrizeClaimRequest(req.user.sub, parsed.data)
  if (result.error) {
    const status = result.error === 'prize_already_claimed' ? 409 : 400
    return res.status(status).json(result)
  }
  return res.status(201).json(result)
}))
