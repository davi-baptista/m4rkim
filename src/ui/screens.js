/**
 * Navegação entre telas e referências aos elementos DOM.
 */

// ─── Navegação ───────────────────────────────────────────────────────────────
export function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'))
  document.getElementById(screenId).classList.remove('hidden')
}

// ─── Elementos DOM (lazy — só acessa quando chamado) ─────────────────────────
export const el = new Proxy({}, {
  get(_, id) {
    const node = document.getElementById(id)
    if (!node) console.warn(`[screens] Elemento #${id} não encontrado.`)
    return node
  },
})
