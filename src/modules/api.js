/**
 * Cliente HTTP da API.
 * Centraliza fetch, JWT e tratamento de erros — nenhum módulo chama fetch diretamente.
 */

const BASE = '/api'
const TOKEN_KEY = 'm4rkim_token'

// ─── Token ────────────────────────────────────────────────────────────────────
export function setToken(t)  { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }
export function getToken()   { return localStorage.getItem(TOKEN_KEY) }

// ─── Fetch com JWT ────────────────────────────────────────────────────────────
async function req(method, path, body) {
  const token = getToken()
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  // Token expirado ou inválido em rotas protegidas → limpa sessão e recarrega.
  // Ignora 401 de /auth/* (credenciais erradas) e /packs/demo (sem token esperado).
  if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/packs/demo')) {
    clearToken()
    window.location.reload()
    return
  }

  return res.json()
}

// ─── Endpoints ────────────────────────────────────────────────────────────────
export const api = {
  me:             ()      => req('GET',  '/me'),
  register:       (body)  => req('POST', '/auth/register',    body),
  login:          (body)  => req('POST', '/auth/login',       body),
  packStatus:     ()      => req('GET',  '/packs/status'),
  openPack:       ()      => req('POST', '/packs/open'),
  openDemoPack:   ()      => req('POST', '/packs/demo'),
  claimDemoPack:  (token) => req('POST', '/packs/demo/claim', { claimToken: token }),
  album:          ()      => req('GET',  '/album'),
  ranking:        ()      => req('GET',  '/ranking'),
  campaignStatus: ()      => req('GET',  '/campaign/status'),
  shareGold:      (slot)  => req('POST', '/shares/gold', { slotNumber: slot }),
}
