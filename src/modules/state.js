/**
 * Gerenciamento de estado da aplicação.
 * Todos os módulos importam daqui — nunca guardam estado local.
 */

export const STATE = Object.freeze({
  IDLE:        'IDLE',
  TEARING:     'TEARING',
  CARD_RISING: 'CARD_RISING',
  CARD_FLIP:   'CARD_FLIP',
  CARD_DONE:   'CARD_DONE',
  FINISHED:    'FINISHED',
})

const _state = {
  current:      STATE.IDLE,
  cardIndex:    0,        // qual carta está em processo (0 ou 1)
  revealed:     [],       // [{ pack, rCfg }] — cartas já reveladas
  pendingCards: [],       // cartas buscadas da API antes da animação iniciar
  user:         null,     // { id, email, username } — preenchido no boot
}

export const appState = _state

export function setState(newState) {
  _state.current = newState
}

export function is(s) {
  return _state.current === s
}

export function setCardIndex(i) {
  _state.cardIndex = i
}

export function setPendingCards(cards) {
  _state.pendingCards = cards
}

export function setUser(user) {
  _state.user = user
}

export function resetState() {
  _state.current      = STATE.IDLE
  _state.cardIndex    = 0
  _state.revealed     = []
  _state.pendingCards = []
}
