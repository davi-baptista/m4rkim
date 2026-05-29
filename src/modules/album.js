/**
 * Módulo da página de álbum.
 * Busca /api/album, renderiza a grade de slots e gerencia o lightbox.
 */

import { api }                    from './api.js'
import { show }                   from '../ui/screens.js'
import { CARDS_DB, RARITY }       from '../config/cards.js'
import { openViewerCard }         from './viewer3d.js'

let _backTarget = 's-cards'  // tela para onde o botão Voltar leva
let _cachedData = null       // último resultado da API (cache em memória)
let _cacheTime  = 0          // timestamp da última busca

// Invalida o cache — chamar após abrir um pack novo para garantir dados frescos
export function invalidateAlbumCache() {
  _cachedData = null
  _cacheTime  = 0
}

// ─── Abre o álbum ────────────────────────────────────────────────────────────
export async function openAlbum(fromScreen = 's-cards') {
  _backTarget = fromScreen
  show('s-album')
  await _render()
}

// ─── Renderiza a grade ───────────────────────────────────────────────────────
async function _render() {
  const grid       = document.getElementById('album-grid')
  const progressEl = document.getElementById('album-progress')
  const barEl      = document.getElementById('album-progress-bar')

  const CACHE_TTL = 5 * 60_000  // 5 min — só revalida em background após esse tempo

  // Tem cache? Mostra IMEDIATAMENTE, sem loading, independente de quando foi buscado.
  // Se estiver velho, atualiza em background silenciosamente.
  if (_cachedData) {
    _applyData(_cachedData, grid, progressEl, barEl)
    if ((Date.now() - _cacheTime) >= CACHE_TTL) {
      _fetchAndUpdate(grid, progressEl, barEl)
    }
    return
  }

  // Primeira abertura (sem cache): mostra loading e aguarda
  grid.innerHTML = '<p class="album-loading">Carregando...</p>'

  const data = await _fetchWithTimeout().catch(() => null)
  if (!data) {
    grid.innerHTML = '<p class="album-loading">Erro ao carregar álbum. Tente novamente.</p>'
    return
  }

  _cachedData = data
  _cacheTime  = Date.now()
  _applyData(data, grid, progressEl, barEl)
}

// Busca com timeout de 8s para não travar infinitamente
function _fetchWithTimeout() {
  return Promise.race([
    api.album(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
  ])
}

// Atualiza cache em background sem bloquear a UI
function _fetchAndUpdate(grid, progressEl, barEl) {
  _fetchWithTimeout().then(fresh => {
    if (!fresh) return
    _cachedData = fresh
    _cacheTime  = Date.now()
    _applyData(fresh, grid, progressEl, barEl)
  }).catch(() => {})
}

// ─── Aplica os dados na UI ───────────────────────────────────────────────────
function _applyData(data, grid, progressEl, barEl) {
  const { slots, progress } = data
  progressEl.textContent = `${progress} figurinhas`

  const [filled, total] = progress.split('/').map(Number)
  if (barEl) barEl.style.width = `${total ? (filled / total) * 100 : 0}%`

  grid.innerHTML = ''
  for (const slot of slots) {
    grid.appendChild(_buildSlot(slot))
  }
}

// ─── Constrói um slot ────────────────────────────────────────────────────────
function _buildSlot(slot) {
  const div = document.createElement('div')
  div.className = 'album-slot'

  if (!slot.filled) {
    div.classList.add('empty')
    const num = document.createElement('span')
    num.className = 'album-slot-num'
    num.textContent = `#${String(slot.slotNumber).padStart(2, '0')}`
    div.appendChild(num)
    return div
  }

  // Slot preenchido
  const { sticker } = slot
  const def  = CARDS_DB[slot.slotNumber] ?? CARDS_DB[1]
  const rCfg = RARITY[sticker.rarity] ?? RARITY.common

  div.classList.add('filled', `rarity-${sticker.rarity}`)

  const img = document.createElement('img')
  img.src = def.images[sticker.rarity] || def.images.common
  img.alt = def.artistName
  img.loading = 'lazy'
  div.appendChild(img)

  // Efeito holo nas raras
  if (rCfg.holoClass) {
    const holo = document.createElement('div')
    holo.className = `holo ${rCfg.holoClass}`
    div.appendChild(holo)
  }

  // Badge numeração nas raras
  if (sticker.copyNumber) {
    const badge = document.createElement('div')
    badge.className = `num-badge ${rCfg.badgeClass}`
    badge.textContent = `${sticker.copyNumber}/${sticker.totalCopies}`
    div.appendChild(badge)
  }

  div.addEventListener('click', () => openViewerCard(
    { slotNumber: slot.slotNumber, rarity: sticker.rarity, copyNumber: sticker.copyNumber, totalCopies: sticker.totalCopies, instanceId: sticker.id },
    rCfg,
    's-album'
  ))

  return div
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function _openLightbox(slot, def, rCfg, sticker) {
  const lb = document.getElementById('album-lightbox')
  const lbImg = document.getElementById('album-lb-img')
  const lbHolo = document.getElementById('album-lb-holo')
  const lbName = document.getElementById('album-lb-name')
  const lbCopy = document.getElementById('album-lb-copy')

  lbImg.src = def.images[sticker.rarity] || def.images.common
  lbImg.alt = def.artistName
  lbName.textContent = def.artistName

  lbCopy.textContent = sticker.copyNumber
    ? `${rCfg.label} · ${sticker.copyNumber}/${sticker.totalCopies}`
    : rCfg.label

  lbHolo.className = `holo ${rCfg.holoClass ?? ''}`

  lb.classList.remove('hidden')
  lb.onclick = e => { if (e.target === lb) lb.classList.add('hidden') }
}

// ─── Inicializa listeners do álbum (chamado uma vez no boot) ──────────────────
export function initAlbumListeners(getBackTarget) {
  document.getElementById('btn-back-album').addEventListener('click', () => {
    document.getElementById('album-lightbox').classList.add('hidden')
    show(_backTarget)
  })

  document.getElementById('album-lb-close').addEventListener('click', () => {
    document.getElementById('album-lightbox').classList.add('hidden')
  })
}
