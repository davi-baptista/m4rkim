/**
 * Configuração central das figurinhas e raridades.
 * Adicionar novos artistas aqui conforme as imagens ficarem prontas.
 */

// ─── Definição das cartas ────────────────────────────────────────────────────
export const CARDS_DB = {
  1: {
    artistName: 'M4RKIM',
    subtitle:   'Cantor / Compositor',
    images: {
      common: '/cards/01.png',
      silver: '/cards/01-prata.png',
      gold:   '/cards/01-dourada.png',
    },
    snippetUrl: null, // ex: '/audio/01-snippet.mp3' — adicionar quando disponível
  },
  2: {
    artistName: 'Itoshi Sae',
    subtitle:   'Personagem / Blue Lock',
    images: {
      common: '/cards/02.png',
      silver: null,   // sem versão prata
      gold:   null,   // sem versão dourada
    },
    snippetUrl: null,
  },
  3: {
    artistName: 'M4RKIM + Itoshi Sae',
    subtitle:   'Cantor / Personagem',
    images: {
      common: '/cards/03.png',
      silver: null,   // sem versão prata
      gold:   null,   // sem versão dourada
    },
    snippetUrl: null,
  },
}

// ─── Propriedades visuais por raridade ──────────────────────────────────────
export const RARITY = {
  common: {
    label:          'Comum',
    badgeClass:     'badge-common',
    holoClass:      null,
    glowClass:      null,
    flashColor:     null,
    particles:      null,
    holoStrength3d: 0.0,
  },
  silver: {
    label:          'Prata',
    badgeClass:     'badge-silver',
    holoClass:      'silver',
    glowClass:      'glow-silver',
    flashColor:     'silver',
    particles:      { count: 70,  color: '#cfd8dc', size: 3 },
    holoStrength3d: 0.38,
  },
  gold: {
    label:          'Dourada ✦',
    badgeClass:     'badge-gold',
    holoClass:      'gold',
    glowClass:      'glow-gold',
    flashColor:     'gold',
    particles:      { count: 130, color: '#fbbf24', size: 4 },
    holoStrength3d: 0.75,
  },
}

// Verso oficial das cartas por raridade
export const CARD_BACKS = {
  common: '/cards/traseira.png',
  silver: '/cards/traseira_prata.png',
  gold: '/cards/traseira_dourada.png',
}

// ─── Mock do pacote ─────────────────────────────────────────────────────────
// TODO: substituir por chamada real → GET /api/pack/open
// Formato esperado do backend: [{ cardId, rarity, copyNumber, totalCopies }]
export const PACK_MOCK = [
  { cardId: 1, rarity: 'common', copyNumber: null, totalCopies: null },
  { cardId: 1, rarity: 'gold',   copyNumber: 3, totalCopies: 5  },
]

// ─── Utilitário: valida e ordena as cartas do pacote ─────────────────────────
// Regras:
//   1. Máximo 1 carta rara (gold/silver) por pacote → extras viram common
//   2. Carta rara sempre vem por último (posição 1), nunca na frente
export function sortPackCards(cards) {
  const RARE = ['gold', 'silver']
  const rares   = cards.filter(c =>  RARE.includes(c.rarity))
  const commons = cards.filter(c => !RARE.includes(c.rarity))

  // Se vier mais de uma rara do backend, demota as extras para comum
  const extraRares = rares.splice(1)
  extraRares.forEach(c =>
    commons.push({ ...c, rarity: 'common', copyNumber: null, totalCopies: null })
  )

  // Comuns primeiro, rara (se houver) sempre no final
  return [...commons, ...rares]
}
