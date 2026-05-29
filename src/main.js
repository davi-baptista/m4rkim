/**
 * Entry point da aplicação.
 *
 * Boot flow:
 *   1. Tem JWT válido?                   → pack screen (usuário logado)
 *   2. Tem demo pendente no localStorage? → s-cards com cartas já abertas + overlay
 *   3. Nenhum dos dois                   → pack screen (nova visita — 1 pack demo grátis)
 *
 * A tela de auth só aparece quando o usuário clica em "Criar conta" / "Entrar"
 * (no overlay pós-demo ou em futuros botões no header).
 */

// ─── Estilos ─────────────────────────────────────────────────────────────────
import './styles/base.css'
import './styles/auth.css'
import './styles/pack.css'
import './styles/cards.css'
import './styles/viewer.css'
import './styles/album.css'

// ─── Módulos ──────────────────────────────────────────────────────────────────
import { api, getToken, clearToken }                    from './modules/api.js'
import { setUser }                                      from './modules/state.js'
import { initAuth }                                     from './modules/authFlow.js'
import { initPack, setAuthCallback, resetPack }         from './modules/pack.js'
import { setDemoAuthCallback, restoreDemoCards, resetDemo } from './modules/cardReveal.js'
import { openViewer, closeViewer, openViewerCard }       from './modules/viewer3d.js'
import { show, getRouteScreen }                         from './ui/screens.js'
import { hasPendingDemo, getDemoPacks, showDemoOverlay, hideDemoOverlay } from './modules/demoFlow.js'
import { openAlbum, initAlbumListeners }                                 from './modules/album.js'
import { initPackIndicator, refreshPackIndicator }                        from './modules/packIndicator.js'

// ─── Listeners do viewer — registrados uma única vez ─────────────────────────
// (evita duplicatas quando _startPackFlow é chamado mais de uma vez)
let _viewerReady = false
function _initViewerListeners() {
  if (_viewerReady) return
  _viewerReady = true
  document.getElementById('btn-back-viewer')
    .addEventListener('click', closeViewer)
  document.getElementById('slot-0')
    .addEventListener('click', () => openViewer(0))
  document.getElementById('slot-1')
    .addEventListener('click', () => openViewer(1))
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  // Valida o JWT se existir
  if (getToken()) {
    const user = await api.me().catch(() => null)
    if (!user || user.error) clearToken()
    else setUser(user)
  }

  // Registra callbacks e listeners globais
  setDemoAuthCallback(_goToAuthFromDemo)
  setAuthCallback(_goToAuth)
  _initViewerListeners()
  _initAlbumListeners()

  // Lê o path ANTES de qualquer navegação (o pack flow pode sobrescrevê-lo)
  // Links de carta (/carta/...) são acessíveis mesmo sem login — visitante vê a carta de outra pessoa
  const savedScreen = getRouteScreen()

  // Link compartilhado de carta (#card/...) sem login: pula o fluxo normal
  // O viewer vai abrir logo abaixo com os dados do hash
  const isSharedCardLink = savedScreen?.type === 'card' && !getToken()

  if (!isSharedCardLink) {
    // Visitante sem conta mas com pack demo pendente:
    // mostra as cartas que ele já tirou + overlay com countdown
    if (!getToken() && hasPendingDemo()) {
      const packs = getDemoPacks()
      if (packs?.length) {
        restoreDemoCards(packs)
      } else {
        _startPackFlow()
      }
    } else {
      await _startPackFlow()
    }
  }

  // Restaura a tela que estava aberta antes do F5, ou abre link compartilhado
  if (savedScreen === 's-album' && getToken()) {
    openAlbum('s-cards')
  } else if (savedScreen?.type === 'card') {
    const { CARDS_DB, RARITY } = await import('./config/cards.js')
    const { slotNumber, rarity } = savedScreen
    const def  = CARDS_DB[slotNumber]
    const rCfg = RARITY[rarity]
    if (def && rCfg) {
      // Dados de identidade: o hash já carrega ownerUsername/copyNumber/totalCopies
      // Se vier do próprio F5 (usuário logado, hash sem owner), tenta completar via álbum
      let { ownerUsername, copyNumber, totalCopies } = savedScreen
      if (!ownerUsername && getToken()) {
        try {
          const albumData = await api.album()
          const slot = albumData?.slots?.find(s => s.slotNumber === slotNumber)
          if (slot?.sticker?.rarity === rarity) {
            copyNumber  = slot.sticker.copyNumber  ?? null
            totalCopies = slot.sticker.totalCopies ?? null
          }
        } catch (_) { /* ignora — abre sem numeração */ }
      }
      // backScreen: se logado vai pro álbum/cards, se anônimo vai pro início
      const backScreen = getToken() ? 's-album' : 's-pack'
      openViewerCard({ slotNumber, rarity, ownerUsername, copyNumber, totalCopies }, rCfg, backScreen)
    }
  }

  // Indicador flutuante de packs (só aparece para usuários logados)
  initPackIndicator()

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('app-booting')
    })
  })
}

// ─── Listeners do álbum — registrados uma única vez ──────────────────────────
let _albumReady = false
function _initAlbumListeners() {
  if (_albumReady) return
  _albumReady = true
  initAlbumListeners()
  // Botões "Ver meu álbum" em s-cards
  document.querySelectorAll('.btn-album').forEach(btn => {
    btn.addEventListener('click', () => openAlbum('s-cards'))
  })
}

// ─── Inicia o fluxo de pack ───────────────────────────────────────────────────
async function _startPackFlow() {
  show('s-pack')
  await initPack()
}

// ─── Vai para a tela de auth ──────────────────────────────────────────────────
// tab: 'login' | 'register'
// fromDemo: true quando chamado a partir do overlay de demo
function _goToAuth(tab = 'login', fromDemo = false) {
  show('s-auth')

  const onSuccess = fromDemo ? _onDemoAuthSuccess : _onAuthSuccess
  initAuth(onSuccess, tab)

  const btnBack = document.getElementById('btn-auth-back')
  if (fromDemo && hasPendingDemo()) {
    btnBack.classList.remove('hidden')
    btnBack.onclick = () => {
      btnBack.classList.add('hidden')
      show('s-cards')
      showDemoOverlay(_goToAuthFromDemo)
    }
  } else {
    btnBack.classList.add('hidden')
  }
}

function _goToAuthFromDemo(tab) { _goToAuth(tab, true) }

// ─── Após autenticação normal ─────────────────────────────────────────────────
function _onAuthSuccess(user) {
  setUser(user)
  resetPack()
  _startPackFlow()
  refreshPackIndicator()
}

// ─── Após autenticação vinda do demo ─────────────────────────────────────────
// Mostra as figurinhas que o usuário acabou de ganhar, sem o overlay.
// O footer passa a ter um botão para ir ao pack (que estará esgotado hoje).
function _onDemoAuthSuccess(user) {
  setUser(user)
  resetDemo()
  hideDemoOverlay()
  document.getElementById('btn-auth-back').classList.add('hidden')
  show('s-cards')
}

boot()
