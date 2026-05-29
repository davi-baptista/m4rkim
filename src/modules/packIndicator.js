/**
 * Indicador flutuante de packs disponíveis.
 *
 * Exibe um badge fixo na tela mostrando quantos packs o usuário pode abrir.
 * Fica oculto na tela do pack (s-pack) e quando não há packs disponíveis.
 * Clicar navega direto para s-pack.
 */

import { api, getToken } from './api.js'

let _available = 0
let _currentScreen = ''

const _el = () => document.getElementById('pack-indicator')

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initPackIndicator() {
  if (!getToken()) return   // visitante sem conta não tem packs

  // Escuta mudanças de tela para ocultar no s-pack
  window.addEventListener('m4rkim:screen', e => {
    _currentScreen = e.detail
    _render()
  })

  await _fetchAndRender()

  // Clique navega para s-pack
  _el()?.addEventListener('click', () => {
    import('../ui/screens.js').then(m => m.show('s-pack'))
  })
}

// ─── Atualiza a contagem (ex: após abrir pack ou receber bônus) ───────────────
export async function refreshPackIndicator() {
  if (!getToken()) return
  await _fetchAndRender()
}

// ─── Internos ─────────────────────────────────────────────────────────────────
async function _fetchAndRender() {
  const status = await api.packStatus().catch(() => null)
  if (status && typeof status.available === 'number') {
    _available = status.available
    _render()
  }
}

function _render() {
  const el = _el()
  if (!el) return

  const isOnPackScreen = _currentScreen === 's-pack'

  if (_available > 0 && !isOnPackScreen) {
    el.textContent = _available === 1 ? '1 pack' : `${_available} packs`
    el.classList.remove('hidden')
  } else {
    el.classList.add('hidden')
  }
}
