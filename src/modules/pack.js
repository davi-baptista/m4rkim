/**
 * Módulo de abertura do pacote.
 *
 * Modos:
 *   - Autenticado: chama /api/packs/open (limite diário validado no servidor)
 *   - Demo (não logado): chama /api/packs/demo (1 carta comum, claimToken 24h)
 *
 * Segurança anti-burla:
 *   - _opening impede múltiplos cliques enquanto o request está em voo.
 *   - Mesmo que o usuário chame a API manualmente, o servidor valida tudo:
 *     limite diário em transação atômica, claimToken assinado e com expiração.
 */

import { setState, setPendingCards, STATE, appState } from './state.js'
import { startCard }                                   from './cardReveal.js'
import { api, getToken }                               from './api.js'
import { saveDemoResult }                               from './demoFlow.js'
import { show }                                        from '../ui/screens.js'

let _opening      = false
let _initialized  = false
let _onAuthNeeded = null   // callback para ir à tela de auth após o demo

export function setAuthCallback(cb) { _onAuthNeeded = cb }

// Chama antes de reiniciar o fluxo de pack (ex: após login bem-sucedido)
export function resetPack() {
  _initialized = false
  _opening     = false
}

export async function initPack() {
  // Evita registrar múltiplos listeners se _startPackFlow for chamado mais de uma vez
  if (_initialized) return
  _initialized = true

  document.getElementById('pack-body').addEventListener('click', _handleTap)
  document.getElementById('btn-go-album')?.addEventListener('click', () => {
    // TODO: navegar para a tela de álbum quando estiver pronta
    console.log('[pack] navegar para álbum')
  })

  // Se o usuário já abriu todos os packs de hoje, mostra o estado esgotado imediatamente
  // sem esperar o próximo clique (evita que o pack pareça disponível quando não está)
  if (getToken()) {
    const status = await api.packStatus().catch(() => null)
    if (status?.available === 0) _showExhausted()
  }
}

async function _handleTap() {
  if (appState.current !== STATE.IDLE || _opening) return
  _opening = true

  try {
    if (getToken()) {
      await _openAuthenticated()
    } else {
      await _openDemo()
    }
  } catch (err) {
    console.error('[pack] erro ao abrir:', err)
    _opening = false
  }
}

// ─── Fluxo autenticado ────────────────────────────────────────────────────────
async function _openAuthenticated() {
  const status = await api.packStatus()

  if (status.available === 0) {
    _showExhausted()
    _opening = false
    return
  }

  // Abre packs sequencialmente — mesmo que o usuário chame a API no DevTools,
  // o servidor bloqueia via transação atômica
  const cards = []
  const count = Math.min(status.available, 2)
  for (let i = 0; i < count; i++) {
    const result = await api.openPack()
    if (result?.error) break
    cards.push(result.pack)
  }

  if (!cards.length) {
    _showExhausted()
    _opening = false
    return
  }

  setPendingCards(cards)
  _startAnimation()
}

// ─── Fluxo demo (visitante sem conta) ────────────────────────────────────────
async function _openDemo() {
  const result = await api.openDemoPack()

  if (result?.error) {
    console.error('[pack] demo error:', result.error)
    _opening = false
    return
  }

  // Salva o token assinado localmente para resgatar após cadastro/login
  saveDemoResult(result.claimToken, result.packs, result.expiresIn)

  setPendingCards(result.packs)
  _startAnimation(/* isDemo */ true)
}

function _startAnimation(isDemo = false) {
  setState(STATE.TEARING)
  document.getElementById('pack-scene').classList.add('opening')
  setTimeout(() => startCard(0, isDemo), 820)
}

function _showExhausted() {
  document.getElementById('pack-scene').classList.add('hidden')
  document.getElementById('pack-exhausted').classList.remove('hidden')
}
