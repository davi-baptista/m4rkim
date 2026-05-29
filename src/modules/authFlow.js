/**
 * Fluxo de autenticação — login e cadastro.
 * Chama onSuccess(user) quando o usuário se autentica com sucesso.
 * Se há um claimToken de pack demo no localStorage, ele é enviado
 * automaticamente e as cartas são resgatadas pelo servidor.
 */

import { api, setToken } from './api.js'
import { getClaimToken, clearDemoData, hideDemoOverlay } from './demoFlow.js'

const ERRORS = {
  invalid_credentials:            'E-mail ou senha incorretos.',
  email_or_username_taken:        'E-mail ou username já em uso.',
  invalid_body:                   'Verifique os campos e tente novamente.',
  too_many_requests:              'Muitas tentativas. Aguarde alguns minutos.',
  invalid_or_expired_claim_token: 'Seu pack demo expirou. Crie a conta assim mesmo — você ganha packs normais!',
  network_error:                  'Sem conexão com o servidor.',
}

// Cancela listeners de chamadas anteriores de initAuth
let _authController = null

// initialTab: 'login' | 'register' — define qual aba abre primeiro
export function initAuth(onSuccess, initialTab = 'login') {
  // Remove todos os listeners da chamada anterior
  if (_authController) _authController.abort()
  _authController = new AbortController()
  const { signal } = _authController

  const tabBtns      = document.querySelectorAll('.auth-tab')
  const formLogin    = document.getElementById('form-login')
  const formRegister = document.getElementById('form-register')
  const errorEl      = document.getElementById('auth-error')

  // ── Aba inicial ─────────────────────────────────────────────────────────────
  _switchTab(tabBtns, formLogin, formRegister, initialTab)

  // ── Troca de aba ────────────────────────────────────────────────────────────
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      errorEl.textContent = ''
      _switchTab(tabBtns, formLogin, formRegister, btn.dataset.tab)
    }, { signal })
  })

  // ── Login ───────────────────────────────────────────────────────────────────
  formLogin.addEventListener('submit', async e => {
    e.preventDefault()
    const btn  = formLogin.querySelector('button[type=submit]')
    const data = Object.fromEntries(new FormData(formLogin))

    _setLoading(btn, true)
    errorEl.textContent = ''

    const result = await api.login(data).catch(() => ({ error: 'network_error' }))
    _setLoading(btn, false)

    if (result?.error) { errorEl.textContent = ERRORS[result.error] ?? 'Algo deu errado.'; return }

    setToken(result.token)

    // Se havia um pack demo pendente, tenta reivindicar após o login
    const claimToken = getClaimToken()
    if (claimToken) {
      const claim = await api.claimDemoPack(claimToken).catch(() => null)
      if (claim?.error === 'invalid_or_expired_claim_token') {
        errorEl.textContent = ERRORS.invalid_or_expired_claim_token
      }
      clearDemoData()
    }

    hideDemoOverlay()
    onSuccess(result.user)
  }, { signal })

  // ── Cadastro ────────────────────────────────────────────────────────────────
  formRegister.addEventListener('submit', async e => {
    e.preventDefault()
    const btn  = formRegister.querySelector('button[type=submit]')
    const data = Object.fromEntries(new FormData(formRegister))

    // Injeta o claimToken no body do registro — o servidor reivindica automaticamente
    const claimToken = getClaimToken()
    if (claimToken) data.claimToken = claimToken

    _setLoading(btn, true)
    errorEl.textContent = ''

    const result = await api.register(data).catch(() => ({ error: 'network_error' }))
    _setLoading(btn, false)

    if (result?.error) { errorEl.textContent = ERRORS[result.error] ?? 'Algo deu errado.'; return }

    clearDemoData()
    setToken(result.token)
    hideDemoOverlay()
    onSuccess(result.user)
  }, { signal })
}

function _switchTab(tabBtns, formLogin, formRegister, tab) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
  formLogin.classList.toggle('hidden',    tab !== 'login')
  formRegister.classList.toggle('hidden', tab !== 'register')
}

function _setLoading(btn, loading) {
  btn.disabled = loading
  if (loading) {
    btn._origText   = btn.textContent
    btn.textContent = 'Aguarde...'
  } else {
    btn.textContent = btn._origText ?? btn.textContent
  }
}
