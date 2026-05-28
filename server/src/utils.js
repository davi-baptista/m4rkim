export function dayKey(date = new Date()) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function serialPrefix(rarity) {
  if (rarity === 'gold') return 'GOLD'
  if (rarity === 'silver') return 'SILV'
  return 'COMM'
}
