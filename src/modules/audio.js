/**
 * Player de snippets de áudio (cartas douradas).
 */

const audioEl = document.getElementById('audio-snippet')
let   playing = false
let   activeButton = null

function syncButtonState(btn, isPlaying) {
  if (!btn) return
  btn.classList.toggle('playing', isPlaying)
  btn.textContent = isPlaying ? '■' : '▶'
}

function finishSnippet() {
  if (activeButton) {
    syncButtonState(activeButton, false)
    activeButton = null
  }
  playing = false
}

/**
 * Alterna reprodução do snippet.
 * @param {string} url  Caminho do arquivo de áudio
 * @param {HTMLElement} btn  Botão que disparou a ação
 */
export function toggleSnippet(url, btn) {
  if (playing) {
    if (activeButton && activeButton !== btn) {
      audioEl.pause()
      audioEl.currentTime = 0
      finishSnippet()
    } else {
      audioEl.pause()
      audioEl.currentTime = 0
      finishSnippet()
      return
    }
  }

  audioEl.src = url
  audioEl.currentTime = 0
  audioEl.play()
    .then(() => {
      playing      = true
      activeButton = btn
      syncButtonState(btn, true)
      audioEl.onended = () => {
        finishSnippet()
      }
    })
    .catch(() => {
      finishSnippet()
    })
}

export function stopSnippet() {
  if (playing) {
    audioEl.pause()
    audioEl.currentTime = 0
    finishSnippet()
  }
}
