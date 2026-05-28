/**
 * Sistema de partículas para revelar cartas raras.
 */

const canvas = document.getElementById('particles')
const ctx    = canvas.getContext('2d')

function resize() {
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
}
window.addEventListener('resize', resize)
resize()

/**
 * @param {{ count: number, color: string, size: number }} config
 */
export function spawn({ count, color, size }) {
  const cx = window.innerWidth  / 2
  const cy = window.innerHeight * 0.38

  const parts = Array.from({ length: count }, () => ({
    x:  cx,
    y:  cy,
    vx: (Math.random() - 0.5) * 14,
    vy: (Math.random() - 0.5) * 14 - 3,
    r:  Math.random() * size + 1,
    a:  1,
  }))

  let raf
  ;(function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let alive = false

    parts.forEach(p => {
      p.x  += p.vx
      p.y  += p.vy
      p.vy += 0.22   // gravidade
      p.a  -= 0.018

      if (p.a > 0) {
        alive = true
        ctx.save()
        ctx.globalAlpha = p.a
        ctx.fillStyle   = color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    })

    if (alive) raf = requestAnimationFrame(draw)
    else ctx.clearRect(0, 0, canvas.width, canvas.height)
  })()
}
