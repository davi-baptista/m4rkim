/**
 * Navegação entre telas e referências aos elementos DOM.
 * Usa path-based routing (sem #): /album, /cards, /carta/:username/:rarity/:slot
 */

const PATH_TO_SCREEN = { '/album': 's-album', '/cards': 's-cards' }
const SCREEN_TO_PATH = { 's-album': '/album', 's-cards': '/cards' }

// ─── Navegação ───────────────────────────────────────────────────────────────
export function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'))
  document.getElementById(screenId).classList.remove('hidden')
  // O viewer escreve seu próprio path; as demais telas usam a tabela acima
  if (screenId !== 's-viewer') {
    const path = SCREEN_TO_PATH[screenId] ?? '/'
    history.replaceState(null, '', path)
  }
  // Notifica módulos que observam mudanças de tela (ex: packIndicator)
  window.dispatchEvent(new CustomEvent('m4rkim:screen', { detail: screenId }))
}

// Lê o path atual e retorna a tela correspondente.
// Formatos: /album | /cards | /carta/:username/:rarity/:slot
export function getRouteScreen() {
  const path = location.pathname

  if (path.startsWith('/carta/')) {
    const parts = path.split('/').filter(Boolean)
    // /carta/username/rarity/slot  → parts = ['carta','username','rarity','slot']
    const ownerUsername = parts[1] || null
    const rarity        = parts[2] || null
    const slotNumber    = parts[3] ? Number(parts[3]) : null
    if (slotNumber && rarity) return { type: 'card', slotNumber, rarity, ownerUsername, copyNumber: null, totalCopies: null }
  }

  return PATH_TO_SCREEN[path] ?? null
}

// ─── Elementos DOM (lazy — só acessa quando chamado) ─────────────────────────
export const el = new Proxy({}, {
  get(_, id) {
    const node = document.getElementById(id)
    if (!node) console.warn(`[screens] Elemento #${id} não encontrado.`)
    return node
  },
})
