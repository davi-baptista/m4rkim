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

// ─── Módulos ──────────────────────────────────────────────────────────────────
import { api, getToken, clearToken }                    from './modules/api.js'
import { initAuth }                                     from './modules/authFlow.js'
import { initPack, setAuthCallback, resetPack }         from './modules/pack.js'
import { setDemoAuthCallback, restoreDemoCards }        from './modules/cardReveal.js'
import { openViewer, closeViewer }                      from './modules/viewer3d.js'
import { show }                                         from './ui/screens.js'
import { hasPendingDemo, getDemoPacks }                  from './modules/demoFlow.js'

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
  }

  // Registra callbacks e listeners globais
  setDemoAuthCallback(_goToAuth)
  setAuthCallback(_goToAuth)
  _initViewerListeners()

  // Visitante sem conta mas com pack demo pendente:
  // mostra as cartas que ele já tirou + overlay com countdown
  if (!getToken() && hasPendingDemo()) {
    const packs = getDemoPacks()
    if (packs?.length) {
      restoreDemoCards(packs)
    } else {
      _startPackFlow()   // token expirado mas packs não encontrados: começa do zero
    }
  } else {
    _startPackFlow()
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('app-booting')
    })
  })
}

// ─── Inicia o fluxo de pack ───────────────────────────────────────────────────
function _startPackFlow() {
  show('s-pack')
  initPack()
}

// ─── Vai para a tela de auth ──────────────────────────────────────────────────
// tab: 'login' | 'register'
function _goToAuth(tab = 'login') {
  show('s-auth')
  initAuth(_onAuthSuccess, tab)
}

// ─── Após autenticação bem-sucedida ──────────────────────────────────────────
function _onAuthSuccess() {
  resetPack()   // limpa flags para reiniciar o fluxo como usuário autenticado
  _startPackFlow()
}

boot()
