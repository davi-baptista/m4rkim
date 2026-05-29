/**
 * Módulo de revelação de cartas.
 * Lê as cartas de appState.pendingCards (preenchidas pela API em pack.js).
 * Não acessa o PACK_MOCK — todo dado vem do backend.
 */

import { setState, setCardIndex, setPendingCards, STATE, appState, is } from './state.js'
import { show }                                         from '../ui/screens.js'
import { triggerFlash }                                 from './flash.js'
import { spawn as spawnParticles }                      from './particles.js'
import { toggleSnippet, stopSnippet }                   from './audio.js'
import { CARDS_DB, RARITY, CARD_BACKS }                 from '../config/cards.js'
import { showDemoOverlay }                              from './demoFlow.js'

const emergingCard = document.getElementById('emerging-card')
const emImg        = document.getElementById('em-img')
const emBackImg    = document.getElementById('em-back-img')
const emHolo       = document.getElementById('em-holo')

// isDemo indica que o pack foi aberto sem login — exibe overlay após a última carta
let _isDemo = false

// ─── Iniciar animação de uma carta ──────────────────────────────────────────
export function startCard(index, isDemo = false) {
  if (index === 0) _isDemo = isDemo
  const pack = appState.pendingCards[index]
  if (!pack) return

  // Busca a definição local da carta pelo slotNumber vindo da API.
  // Se ainda não tivermos imagens para esse slot, usa slot 1 (M4RKIM) como fallback.
  const def  = CARDS_DB[pack.slotNumber] ?? CARDS_DB[1]
  const rCfg = RARITY[pack.rarity]

  emImg.src        = def.images[pack.rarity] || def.images.common
  emImg.onerror    = () => { emImg.onerror = null; emImg.src = def.images.common }
  emBackImg.src    = CARD_BACKS[pack.rarity]
  emHolo.className = 'holo'

  _resetEmerging()
  setState(STATE.CARD_RISING)

  requestAnimationFrame(() => {
    emergingCard.classList.add('rise')

    setTimeout(() => {
      setState(STATE.CARD_FLIP)

      if (rCfg.flashColor) {
        triggerFlash(rCfg.flashColor)
        spawnParticles(rCfg.particles)
        setTimeout(() => _flipCard(index, pack, rCfg), 260)
      } else {
        _flipCard(index, pack, rCfg)
      }
    }, 720)
  })
}

// ─── Virar a carta ──────────────────────────────────────────────────────────
function _flipCard(index, pack, rCfg) {
  emergingCard.classList.add('flip')

  setTimeout(() => {
    if (rCfg.holoClass) emHolo.classList.add(rCfg.holoClass)
    if (rCfg.glowClass) {
      emergingCard.classList.add(rCfg.glowClass)
      emergingCard._activeGlow = rCfg.glowClass
    }

    appState.revealed[index] = { pack, rCfg }
    setState(STATE.CARD_DONE)

    // Se só veio 1 carta (ex: usuário tinha 1 pack restante), vai direto pra tela final
    const totalCards = appState.pendingCards.length
    if (index === 0 && totalCards > 1) {
      _showNextHint()
    } else {
      setTimeout(showCardsScreen, 700)
    }
  }, 430)
}

// ─── Hint e avanço para segunda carta ───────────────────────────────────────
function _showNextHint() {
  document.getElementById('s-pack').addEventListener('click', _advanceToSecond, { once: true })
}

function _advanceToSecond(e) {
  if (!is(STATE.CARD_DONE) || appState.cardIndex !== 0) return

  setCardIndex(1)
  setTimeout(() => {
    _resetEmerging()
    startCard(1)
  }, 300)
}

// ─── Tela final com as cartas reveladas ─────────────────────────────────────
export function showCardsScreen() {
  setState(STATE.FINISHED)
  stopSnippet()
  show('s-cards')

  // Se foi um pack demo, mostra o overlay de cadastro após a animação das cartas
  if (_isDemo) {
    setTimeout(() => showDemoOverlay(_onDemoAuthRequested), 900)
  }

  // s-cards tem 2 slots fixos no HTML — exibe as primeiras 2 cartas do dia.
  // Cartas extras (pack bônus) ficam salvas no álbum normalmente.
  appState.revealed.slice(0, 2).forEach(({ pack, rCfg }, i) => {
    const def    = CARDS_DB[pack.slotNumber] ?? CARDS_DB[1]
    const imgEl  = document.getElementById(`slot-img-${i}`)
    const holoEl = document.getElementById(`slot-holo-${i}`)
    const badge  = document.getElementById(`slot-badge-${i}`)
    const slot   = document.getElementById(`slot-${i}`)
    if (!slot || !imgEl) return

    imgEl.src     = def.images[pack.rarity] || def.images.common
    imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = def.images.common }
    slot.querySelector('.snippet-btn')?.remove()

    // Badge: mostra "1/5" apenas para raras numeradas; comuns não exibem nada
    badge.className   = `num-badge ${rCfg.badgeClass}`
    badge.textContent = pack.copyNumber
      ? `${pack.copyNumber}/${pack.totalCopies}`
      : ''

    if (rCfg.holoClass) holoEl.classList.add(rCfg.holoClass)
    if (rCfg.glowClass) slot.classList.add(rCfg.glowClass)

    // Botão de snippet em cartas douradas com áudio
    if (pack.rarity === 'gold' && def.snippetUrl) {
      const btn = document.createElement('button')
      btn.className   = 'snippet-btn'
      btn.textContent = '▶'
      btn.title       = 'Ouvir trecho exclusivo'
      btn.addEventListener('click', e => {
        e.stopPropagation()
        toggleSnippet(def.snippetUrl, btn)
      })
      slot.appendChild(btn)
    }

    // Hint de bônus em carta dourada (só se usuário ainda não resgatou)
    slot.querySelector('.share-bonus-hint')?.remove()
    if (pack.rarity === 'gold' && !appState.user?.goldShareBonusClaimed) {
      const hint = document.createElement('span')
      hint.className   = 'share-bonus-hint'
      hint.textContent = '🎁 Compartilhe → +1 pack'
      slot.appendChild(hint)
    }

    // Entrada escalonada
    setTimeout(() => slot.classList.add('show'), i * 220 + 80)
  })
}

// ─── Restaurar cartas demo ao retornar ao site ────────────────────────────────
/**
 * Chamado quando o visitante já abriu um pack demo e voltou ao site
 * sem ter criado conta. Pula a animação e vai direto para a tela de cartas
 * com o overlay de cadastro + countdown.
 */
export function restoreDemoCards(packs) {
  _isDemo = true
  setPendingCards(packs)
  appState.revealed = packs.map(pack => ({
    pack,
    rCfg: RARITY[pack.rarity] ?? RARITY.common,
  }))
  setState(STATE.FINISHED)

  showCardsScreen()
}

// ─── Reset do flag de demo (chamado após autenticação bem-sucedida) ───────────
export function resetDemo() { _isDemo = false }

// ─── Callback de auth após demo ──────────────────────────────────────────────
// Preenchido pelo main.js para não criar dependência circular
let _demoAuthCb = null
export function setDemoAuthCallback(cb) { _demoAuthCb = cb }
function _onDemoAuthRequested(tab) { _demoAuthCb?.(tab) }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _resetEmerging() {
  emergingCard.style.transition = 'none'
  emergingCard.classList.remove('rise', 'flip')
  if (emergingCard._activeGlow) {
    emergingCard.classList.remove(emergingCard._activeGlow)
    emergingCard._activeGlow = null
  }
  void emergingCard.offsetWidth  // reflow forçado
  emergingCard.style.transition = ''
}
