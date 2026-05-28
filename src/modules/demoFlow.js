/**
 * Fluxo do pack demo — visita sem cadastro.
 *
 * Ciclo de vida:
 *   1. Visitante abre o pack → servidor retorna claimToken JWT (24h)
 *   2. Token e dados do pack ficam no localStorage
 *   3. Após ver as cartas, overlay aparece pedindo cadastro/login
 *   4. Ao criar conta: claimToken vai junto no body do /auth/register
 *   5. Ao fazer login: claimToken é enviado para /packs/demo/claim
 *   6. Servidor valida assinatura e expiração — não há como forjar
 */

const CLAIM_TOKEN_KEY = 'm4rkim_claim_token'
const DEMO_PACK_KEY   = 'm4rkim_demo_pack'
const DEMO_EXP_KEY    = 'm4rkim_demo_exp'

// ─── Persistência local ───────────────────────────────────────────────────────
// packs: array de cartas [ { slotNumber, artistName, rarity, ... } ]
export function saveDemoResult(claimToken, packs, expiresIn) {
  const expiresAt = Date.now() + expiresIn * 1000
  localStorage.setItem(CLAIM_TOKEN_KEY, claimToken)
  localStorage.setItem(DEMO_PACK_KEY,   JSON.stringify(packs))
  localStorage.setItem(DEMO_EXP_KEY,    String(expiresAt))
}

export function getClaimToken()  { return localStorage.getItem(CLAIM_TOKEN_KEY) }

// Retorna sempre um array — compatível com tokens antigos (objeto único)
export function getDemoPacks() {
  const v = localStorage.getItem(DEMO_PACK_KEY)
  if (!v) return null
  const parsed = JSON.parse(v)
  return Array.isArray(parsed) ? parsed : [parsed]
}

export function getDemoExpiresAt() { const v = localStorage.getItem(DEMO_EXP_KEY); return v ? Number(v) : null }

export function clearDemoData() {
  localStorage.removeItem(CLAIM_TOKEN_KEY)
  localStorage.removeItem(DEMO_PACK_KEY)
  localStorage.removeItem(DEMO_EXP_KEY)
}

export function hasPendingDemo() {
  const token = getClaimToken()
  const exp   = getDemoExpiresAt()
  return Boolean(token && exp && Date.now() < exp)
}

// ─── Overlay de resgate ───────────────────────────────────────────────────────
let _timerInterval = null

export function showDemoOverlay(onGoToAuth) {
  const overlay   = document.getElementById('demo-overlay')
  const timerEl   = document.getElementById('demo-timer')
  const btnReg    = document.getElementById('btn-demo-register')
  const btnLogin  = document.getElementById('btn-demo-login')

  overlay.classList.remove('hidden')

  // Countdown até expirar
  function tick() {
    const remaining = getDemoExpiresAt() - Date.now()
    if (remaining <= 0) {
      timerEl.textContent = 'Seu pack demo expirou.'
      clearInterval(_timerInterval)
      clearDemoData()
      return
    }
    const h  = Math.floor(remaining / 3_600_000)
    const m  = Math.floor((remaining % 3_600_000) / 60_000)
    const s  = Math.floor((remaining % 60_000) / 1_000)
    timerEl.textContent =
      `Você tem ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} para criar uma conta`
  }

  tick()
  _timerInterval = setInterval(tick, 1_000)

  btnReg.onclick   = () => { clearInterval(_timerInterval); onGoToAuth('register') }
  btnLogin.onclick = () => { clearInterval(_timerInterval); onGoToAuth('login') }
}

export function hideDemoOverlay() {
  document.getElementById('demo-overlay').classList.add('hidden')
  clearInterval(_timerInterval)
}
