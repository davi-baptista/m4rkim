import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { router } from './routes.js'
import { getPublicCardInfo } from './services/album.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))
app.use(express.json())

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Auth: 10 tentativas a cada 15 min por IP — protege contra brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
})

// Packs: 20 requests por minuto por IP — bem acima do necessário (máx 2 packs/dia),
// mas impede flood automatizado sem atrapalhar uso normal
const packLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
})

// Demo: limite por hora por IP — a proteção real contra abuso é o demoClaimed no DB.
// Em dev, limite alto para não atrapalhar testes.
const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
})

// Rate limiting desativado em dev — reativar ANTES do deploy em produção!
if (process.env.NODE_ENV === 'production') {
  app.use('/api/auth',       authLimiter)
  app.use('/api/packs/demo', demoLimiter)
  app.use('/api/packs',      packLimiter)
}

// ─── API ──────────────────────────────────────────────────────────────────────
app.use('/api', router)

// ─── Rota de carta compartilhável — /carta/:username/:rarity/:slot ────────────
// Em produção: injeta og:tags no index.html e serve o SPA normalmente.
// Em dev: redireciona pro Vite (que serve o SPA com SPA fallback).
app.get('/carta/:username/:rarity/:slot', async (req, res, next) => {
  const { username, rarity, slot } = req.params
  const slotNumber = Number(slot)

  const RARITY_LABELS = { gold: 'Dourada', silver: 'Prata', common: 'Comum' }
  const label = RARITY_LABELS[rarity] ?? rarity

  let title, description
  try {
    const card = await getPublicCardInfo(username, slotNumber, rarity)
    if (card) {
      const num = card.copyNumber ? ` #${card.copyNumber}/${card.totalCopies}` : ''
      title       = `Carta ${label}${num} de @${username} — Álbum M4RKIM`
      description = `@${username} tirou a carta ${label}${num} de ${card.artistName}! Venha colecionar e concorrer a R$500.`
    }
  } catch { /* ignora — usa fallback */ }

  title       ??= `Carta ${label} de @${username} — Álbum M4RKIM`
  description ??= `Veja a carta ${label} de @${username} no álbum do M4RKIM! Colete todas e concorra a R$500.`

  if (process.env.NODE_ENV !== 'production') {
    // Em dev: apenas redireciona pro Vite — og:tags não importam em dev
    return res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/carta/${username}/${rarity}/${slot}`)
  }

  // Em produção: lê o index.html buildado e injeta og:tags antes de servir
  const distPath  = path.resolve(__dirname, '../../dist')
  const indexPath = path.join(distPath, 'index.html')
  try {
    const { readFileSync } = await import('node:fs')
    const html = readFileSync(indexPath, 'utf-8')
    const ogTags = `
  <title>${escHtml(title)}</title>
  <meta property="og:title"        content="${escHtml(title)}">
  <meta property="og:description"  content="${escHtml(description)}">
  <meta property="og:type"         content="website">
  <meta property="og:url"          content="${req.protocol}://${req.get('host')}${req.originalUrl}">
  <meta name="twitter:card"        content="summary">
  <meta name="twitter:title"       content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">`
    const injected = html.replace('</head>', `${ogTags}\n</head>`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.send(injected)
  } catch {
    next()  // fallback para o catch-all se algo falhar
  }
})

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ─── Serve o frontend buildado (produção) ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../../dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

// ─── Error handler global ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err)
  const status  = err.status ?? err.statusCode ?? 500
  const message = process.env.NODE_ENV === 'production' ? 'internal_error' : err.message
  res.status(status).json({ error: message })
})

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[api] running on http://localhost:${config.port}`)
})
