import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { router } from './routes.js'

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

app.use('/api/auth',         authLimiter)
app.use('/api/packs/demo',   demoLimiter)
app.use('/api/packs',        packLimiter)

// ─── API ──────────────────────────────────────────────────────────────────────
app.use('/api', router)

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
