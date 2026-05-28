/**
 * Efeito de flash para revelar cartas raras.
 */

const flashEl = document.getElementById('flash')

/**
 * @param {'gold'|'silver'} colorClass
 * @param {Function} [onDone]
 */
export function triggerFlash(colorClass, onDone) {
  flashEl.className = colorClass
  void flashEl.offsetWidth              // força reflow para reiniciar a animação
  flashEl.classList.add('playing')

  setTimeout(() => {
    flashEl.className = ''
    onDone?.()
  }, 650)
}
