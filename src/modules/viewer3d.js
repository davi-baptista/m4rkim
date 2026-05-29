/**
 * Visualizador 3D das cartas com shader holográfico.
 * Usa Three.js instalado via npm (não CDN).
 */

import * as THREE from 'three'
import { CARDS_DB, RARITY, CARD_BACKS } from '../config/cards.js'
import { appState, STATE, is } from './state.js'
import { show } from '../ui/screens.js'
import { stopSnippet, toggleSnippet } from './audio.js'
import { api, getToken } from './api.js'

// ─── GLSL Shaders ────────────────────────────────────────────────────────────
const VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv     = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform float     uHolo;
  uniform float     uTime;
  uniform float     uWarm;   // 0=sparkles arco-íris, 1=sparkles dourados

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  vec3 hue2rgb(float h) {
    h = fract(h);
    return clamp(vec3(
      abs(h * 6.0 - 3.0) - 1.0,
      2.0 - abs(h * 6.0 - 2.0),
      2.0 - abs(h * 6.0 - 4.0)
    ), 0.0, 1.0);
  }

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec4  tex   = texture2D(uTex, vUv);
    float fres  = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.2);
    float h     = vUv.x * 0.5 + vUv.y * 0.3 + uTime * 0.08 + fres * 0.45;
    vec3  rain  = hue2rgb(h);
    float band  = 0.5 + 0.5 * sin((vUv.x * 5.5 + vUv.y * 7.0) + uTime * 1.8);
    float sweep = smoothstep(0.15, 0.95, band);
    float spec   = pow(max(dot(reflect(-vViewDir, vNormal), vec3(0, 0, 1)), 0.0), 18.0);

    // Gold: varredura diagonal de luz + reflexo especular mais intenso
    vec3 warmBase  = vec3(0.82, 0.58, 0.12);
    vec3 goldHigh  = vec3(1.00, 0.88, 0.42);
    // Diagonal sweep que varre a carta lentamente
    float diag     = vUv.x * 0.6 + vUv.y * 0.4 + uTime * 0.05;
    float diagBand = 0.5 + 0.5 * sin(diag * 4.0);
    float shine    = smoothstep(0.45, 0.85, diagBand) * smoothstep(0.95, 0.45, diagBand);
    vec3 goldGlow  = mix(warmBase, goldHigh, shine + fres * 0.4);

    // Limbo dourado nas bordas (fresnel mais forte para gold)
    float goldFres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 1.6);
    goldGlow += vec3(0.95, 0.72, 0.18) * goldFres * 0.55;

    vec3 silverGlow = mix(rain * 0.6, vec3(0.90, 0.94, 1.0), 0.35 + fres * 0.25);
    vec3 holo = mix(silverGlow, goldGlow, uWarm);
    holo += spec * (uWarm > 0.5 ? 0.18 : 0.09);

    vec3 outCol = tex.rgb + holo * uHolo;
    // Soft highlight roll-off para evitar dourado "amarelo chapado"
    outCol = outCol / (outCol + vec3(1.0));
    outCol = pow(outCol, vec3(0.92));
    gl_FragColor = vec4(outCol, 1.0);
  }
`

// ─── Estado interno do viewer ─────────────────────────────────────────────────
let renderer, scene, camera, cardGroup, raf
let drag = false, prev = { x: 0, y: 0 }, vx = 0, vy = 0
let pdx = 0, pdy = 0   // delta pendente — aplicado no RAF, não no evento
let _backScreen = 's-cards'

// ─── Abrir viewer a partir de s-cards (pelo índice em appState.revealed) ──────
export function openViewer(index) {
  if (!is(STATE.FINISHED)) return
  const { pack, rCfg } = appState.revealed[index]
  openViewerCard(pack, rCfg, 's-cards')
}

// ─── Abrir viewer com dados diretos (usado pelo álbum e pelo boot/hash) ────────
export function openViewerCard(pack, rCfg, backScreen = 's-cards') {
  _backScreen = backScreen
  stopSnippet()

  const def = CARDS_DB[pack.slotNumber] ?? CARDS_DB[1]

  document.getElementById('viewer-label').textContent =
    `${rCfg.label} — ${def.artistName}`

  document.querySelector('.prize-banner')?.classList.add('viewer-hidden')

  // Persiste o path para restaurar no F5 e servir como link de compartilhamento
  const _pathOwner = pack.ownerUsername || appState.user?.username || null
  if (_pathOwner) {
    history.replaceState(null, '', `/carta/${_pathOwner}/${pack.rarity}/${pack.slotNumber}`)
  }
  // Se não houver username (edge case), mantém o path atual sem sobrescrever

  // Painel exclusivo de cartas douradas
  if (pack.rarity === 'gold') {
    _setupGoldPanel(pack, def)
  } else {
    _hideGoldPanel()
  }

  show('s-viewer')
  _init(def.images[pack.rarity], rCfg.holoStrength3d, pack.rarity)
}

// ─── Painel dourado ───────────────────────────────────────────────────────────
function _setupGoldPanel(pack, def) {
  const panel     = document.getElementById('viewer-gold-panel')
  const sharePanel= document.getElementById('viewer-share-panel')
  const copyEl    = document.getElementById('vgp-copy')
  const ownerEl   = document.getElementById('vgp-owner')
  const audioDiv  = document.getElementById('vgp-audio')
  const audioBar  = document.getElementById('vgp-audio-progress')
  const shareX    = document.getElementById('vgp-share-x')
  const shareWa   = document.getElementById('vgp-share-wa')
  const shareCopy = document.getElementById('vgp-share-copy')
  const copiedEl  = document.getElementById('vsp-copied')

  // ── Identidade ─────────────────────────────────────────────────────────────
  // ownerUsername: quem compartilhou o link; username: usuário logado atual
  const username = pack.ownerUsername ?? appState.user?.username
  ownerEl.textContent = username ? `@${username}` : ''
  ownerEl.classList.toggle('hidden', !username)

  if (pack.copyNumber) {
    copyEl.innerHTML  = `<span class="vgp-num">${pack.copyNumber}/${pack.totalCopies}</span>`
    copyEl.classList.remove('hidden')
  } else {
    copyEl.classList.add('hidden')
  }

  // ── Player de áudio ────────────────────────────────────────────────────────
  const audioEl = document.getElementById('audio-snippet')
  if (def.snippetUrl) {
    audioDiv.classList.remove('hidden')

    audioEl.ontimeupdate = () => {
      if (!audioEl.duration) return
      audioBar.style.width = `${(audioEl.currentTime / audioEl.duration) * 100}%`
    }
    audioEl.onended = () => {
      _resetAudioBtn()
      audioBar.style.width = '0%'
    }

    const newBtn = document.getElementById('vgp-audio-btn').cloneNode(true)
    document.getElementById('vgp-audio-btn').replaceWith(newBtn)
    newBtn.addEventListener('click', () => {
      const icon = newBtn.querySelector('.vgp-audio-icon')
      if (audioEl.paused) {
        audioEl.src = def.snippetUrl
        audioEl.play().then(() => {
          icon.textContent = '■'
          newBtn.classList.add('playing')
        }).catch(() => {})
      } else {
        audioEl.pause()
        audioEl.currentTime = 0
        icon.textContent = '▶'
        newBtn.classList.remove('playing')
        audioBar.style.width = '0%'
      }
    })
  } else {
    audioDiv.classList.add('hidden')
  }

  // ── Compartilhamento ───────────────────────────────────────────────────────
  // URL limpa com og:tags: /carta/username/rarity/slot
  const _shareOwner = username ?? ''
  const shareUrl = _shareOwner
    ? `${location.origin}/carta/${_shareOwner}/${pack.rarity}/${pack.slotNumber}`
    : `${location.origin}${location.pathname}${location.hash}`
  const shareText = pack.copyNumber
    ? `Olha a carta dourada ${pack.copyNumber}/${pack.totalCopies} que eu tirei no álbum do M4RKIM 👀 Quem completar o álbum ganha R$500 — veja minha carta:`
    : `Olha a carta dourada que eu tirei no álbum do M4RKIM 👀 Quem completar o álbum ganha R$500 — veja minha carta:`

  // slotNumber é sempre disponível — usado para registrar o bônus no servidor
  const _doShare = (openUrl) => {
    window.open(openUrl, '_blank')
    if (!getToken()) return   // visitante anônimo — sem bônus
    api.shareGold(pack.slotNumber).then(res => {
      if (res?.error) { console.warn('[share] erro:', res.error); return }
      if (res?.bonusGranted) {
        _showBonusToast()
        if (appState.user) appState.user.goldShareBonusClaimed = true
        document.getElementById('vsp-bonus-hint')?.classList.add('hidden')
        import('./packIndicator.js').then(m => m.refreshPackIndicator())
      }
    }).catch(err => console.warn('[share] falha:', err))
  }

  shareX.onclick = () =>
    _doShare(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`)

  shareWa.onclick = () =>
    _doShare(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`)

  shareCopy.onclick = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      copiedEl.classList.remove('hidden')
      setTimeout(() => copiedEl.classList.add('hidden'), 2200)
    })
  }

  // Hint de bônus: só aparece para o dono da carta que ainda não compartilhou
  const bonusHint = document.getElementById('vsp-bonus-hint')
  const isOwner   = !pack.ownerUsername || pack.ownerUsername === appState.user?.username
  const canEarn   = isOwner && appState.user && !appState.user.goldShareBonusClaimed
  bonusHint.classList.toggle('hidden', !canEarn)

  panel.classList.remove('hidden')
  sharePanel.classList.remove('hidden')
}

// ─── Toast de bônus desbloqueado ─────────────────────────────────────────────
function _showBonusToast() {
  let toast = document.getElementById('bonus-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'bonus-toast'
    document.body.appendChild(toast)
  }
  toast.innerHTML = '🎁 +1 pack desbloqueado! <strong>Abrir agora →</strong>'
  toast.style.cursor = 'pointer'
  toast.onclick = () => {
    toast.classList.replace('bonus-toast-show', 'bonus-toast-hide')
    import('./viewer3d.js').then(m => m.closeViewer())
    import('../ui/screens.js').then(m => m.show('s-pack'))
  }
  toast.classList.remove('bonus-toast-hide')
  toast.classList.add('bonus-toast-show')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => {
    toast.classList.replace('bonus-toast-show', 'bonus-toast-hide')
  }, 6000)
}

function _resetAudioBtn() {
  const btn = document.getElementById('vgp-audio-btn')
  if (!btn) return
  btn.querySelector('.vgp-audio-icon').textContent = '▶'
  btn.classList.remove('playing')
}

function _hideGoldPanel() {
  document.getElementById('viewer-gold-panel')?.classList.add('hidden')
  document.getElementById('viewer-share-panel')?.classList.add('hidden')
  const audioEl = document.getElementById('audio-snippet')
  if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
}

// ─── Fechar viewer ────────────────────────────────────────────────────────────
export function closeViewer() {
  cancelAnimationFrame(raf)
  _removeListeners()
  stopSnippet()
  _hideGoldPanel()

  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  // Remove a aura após a transição de fade-out do viewer (~400ms) para
  // não aparecer sumindo antes da tela mudar
  const viewerEl = document.getElementById('s-viewer')
  setTimeout(() => viewerEl?.classList.remove('aura-gold', 'aura-silver'), 420)

  document.querySelector('#s-viewer .no-server-msg')?.remove()
  document.querySelector('.prize-banner')?.classList.remove('viewer-hidden')

  show(_backScreen)
}

// ─── Inicializar Three.js ────────────────────────────────────────────────────
function _init(imageUrl, holoStrength, rarity) {
  const canvas = document.getElementById('three-canvas')
  const W = window.innerWidth
  const H = window.innerHeight

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(W, H)
  renderer.setClearColor(0x04040a)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1

  scene  = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100)
  camera.position.z = 5.5

  // Limpa o canvas imediatamente — evita mostrar o último frame da carta anterior
  renderer.render(scene, camera)

  const loader = new THREE.TextureLoader()
  const backUrl = CARD_BACKS[rarity] ?? CARD_BACKS.common

  Promise.all([
    _loadTexture(loader, imageUrl, true),
    _loadTexture(loader, backUrl, true),
  ]).then(([frontTex, backTex]) => {
    const resolvedBack = backTex ?? _makeBackTexture()
    if (!frontTex) {
      _showNoServerMessage()
      _buildCard(_makePlaceholderTexture(rarity), resolvedBack, holoStrength, rarity)
      return
    }
    _buildCard(frontTex, resolvedBack, holoStrength, rarity)
  })
}

// ─── Geometria de card com bordas genuinamente arredondadas ──────────────────
// Usa ExtrudeGeometry com Shape arredondado — sem BoxGeometry.
// Retorna { frontGeo, backGeo, edgeGeo } como meshes separados para poder
// usar materiais diferentes na frente, verso e lateral.
function _makeRoundedCardMeshes(frontMat, backMat, edgeMat, w, h, depth, r) {
  const hw = w / 2, hh = h / 2
  const shape = new THREE.Shape()
  shape.moveTo(-hw + r, -hh)
  shape.lineTo( hw - r, -hh);  shape.absarc( hw - r, -hh + r, r, -Math.PI / 2, 0, false)
  shape.lineTo( hw, hh - r);   shape.absarc( hw - r,  hh - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-hw + r, hh);   shape.absarc(-hw + r,  hh - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-hw, -hh + r);  shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false)

  // ── Face da frente (ShapeGeometry plana, UVs normalizados 0–1) ────────────
  const frontGeo = new THREE.ShapeGeometry(shape, 6)
  const fuv = frontGeo.attributes.uv
  for (let i = 0; i < fuv.count; i++) {
    fuv.setXY(i, (fuv.getX(i) + hw) / w, (fuv.getY(i) + hh) / h)
  }
  fuv.needsUpdate = true
  const frontMesh = new THREE.Mesh(frontGeo, frontMat)
  frontMesh.position.z = depth / 2

  // ── Face do verso (clone invertido) ───────────────────────────────────────
  const backGeo = frontGeo.clone()
  // Inverte normais e UVs horizontalmente para ficar correto visto de trás
  const buv = backGeo.attributes.uv
  for (let i = 0; i < buv.count; i++) buv.setX(i, 1 - buv.getX(i))
  buv.needsUpdate = true
  const backMesh = new THREE.Mesh(backGeo, backMat)
  backMesh.position.z = -depth / 2
  backMesh.rotation.y = Math.PI

  // ── Lateral (ExtrudeGeometry, apenas as paredes) ──────────────────────────
  const edgeGeo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: 6,
  })
  // ExtrudeGeometry cria grupo 0 (caps — frente/verso) e grupo 1 (paredes laterais).
  // As caps causam z-fighting com frontMesh/backMesh pois ficam na mesma posição z.
  // Tornamos as caps invisíveis (sem depthWrite) para que só as paredes laterais renderizem.
  const capInvisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  const edgeMesh = new THREE.Mesh(edgeGeo, [capInvisible, edgeMat])
  edgeMesh.position.z = -depth / 2

  return [frontMesh, backMesh, edgeMesh]
}

// ─── Montar a carta na cena ──────────────────────────────────────────────────
function _buildCard(frontTex, backTex, holoStrength, rarity) {
  const frontMat = new THREE.MeshBasicMaterial({ map: frontTex, side: THREE.FrontSide })
  const backMat  = new THREE.MeshBasicMaterial({ map: backTex,  side: THREE.FrontSide })
  const edgeColor   = rarity === 'gold' ? 0xd97706 : rarity === 'silver' ? 0x64748b : 0x1e3a5f
  const edgeEmissive = rarity === 'gold' ? 0x92400e : rarity === 'silver' ? 0x1e293b : 0x000000
  const edgeMat   = new THREE.MeshStandardMaterial({
    color: edgeColor,
    emissive: edgeEmissive,
    emissiveIntensity: rarity === 'gold' ? 1.2 : 0.4,
    roughness: 0.3,
    metalness: rarity === 'gold' ? 0.8 : 0.5,
  })

  const meshes = _makeRoundedCardMeshes(frontMat, backMat, edgeMat, 2.5, 3.5, 0.055, 0.13)

  cardGroup = new THREE.Group()
  meshes.forEach(m => cardGroup.add(m))
  cardGroup.rotation.y = -0.35
  scene.add(cardGroup)

  _addStarfield(rarity)

  scene.add(new THREE.AmbientLight(0xffffff, 0.45))
  const key = new THREE.DirectionalLight(0xffffff, 0.55)
  key.position.set(3, 3, 5)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xbcd7ff, 0.22)
  fill.position.set(-2.4, -1.8, 3.6)
  scene.add(fill)

  // Aura colorida via CSS — fica sempre atrás do canvas Three.js, sem z-fighting
  const viewer = document.getElementById('s-viewer')
  viewer.classList.remove('aura-gold', 'aura-silver')
  if (rarity === 'gold' || rarity === 'silver') {
    viewer.classList.add(`aura-${rarity}`)
  }


  _addListeners()
  window.addEventListener('resize', _onResize)

  let lastTime = performance.now()
  ;(function loop(now) {
    raf = requestAnimationFrame(loop)

    const dt = Math.min((now - lastTime) / (1000 / 60), 3)
    lastTime = now

    if (drag) {
      vy = pdx * 0.005
      vx = pdy * 0.005
      cardGroup.rotation.y += vy * dt
      cardGroup.rotation.x += vx * dt
      pdx = 0; pdy = 0
    } else {
      cardGroup.rotation.y += vy * dt
      cardGroup.rotation.x += vx * dt
      vx *= Math.pow(0.92, dt)
      vy *= Math.pow(0.92, dt)
      if (Math.abs(vy) < 0.001 && Math.abs(vx) < 0.001) cardGroup.rotation.y += 0.004 * dt
    }

    cardGroup.rotation.x = Math.max(-1.1, Math.min(1.1, cardGroup.rotation.x))

    renderer.render(scene, camera)
  })(performance.now())
}

// ─── Event listeners de drag ──────────────────────────────────────────────────
function _onDown(e)   {
  drag = true
  vx = 0; vy = 0; pdx = 0; pdy = 0
  prev = { x: e.clientX, y: e.clientY }
}
function _onUp()      { drag = false }
function _onMove(e)   { if (!drag) return; _accDrag(e.clientX, e.clientY) }
function _onTStart(e) {
  if (e.touches.length !== 1) return
  drag = true
  vx = 0; vy = 0; pdx = 0; pdy = 0
  prev = { x: e.touches[0].clientX, y: e.touches[0].clientY }
}
function _onTMove(e)  {
  if (!drag || e.touches.length !== 1) return
  _accDrag(e.touches[0].clientX, e.touches[0].clientY)
}

// Só acumula o delta — a rotação é aplicada no RAF
function _accDrag(cx, cy) {
  pdx += cx - prev.x
  pdy += cy - prev.y
  prev = { x: cx, y: cy }
}

function _onResize() {
  if (!renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function _addListeners() {
  const c = document.getElementById('three-canvas')
  c.addEventListener('mousedown',  _onDown)
  c.addEventListener('mousemove',  _onMove)
  c.addEventListener('mouseup',    _onUp)
  c.addEventListener('mouseleave', _onUp)
  c.addEventListener('touchstart', _onTStart, { passive: true })
  c.addEventListener('touchmove',  _onTMove,  { passive: true })
  c.addEventListener('touchend',   _onUp)
}

function _removeListeners() {
  const c = document.getElementById('three-canvas')
  if (!c) return
  c.removeEventListener('mousedown',  _onDown)
  c.removeEventListener('mousemove',  _onMove)
  c.removeEventListener('mouseup',    _onUp)
  c.removeEventListener('mouseleave', _onUp)
  c.removeEventListener('touchstart', _onTStart)
  c.removeEventListener('touchmove',  _onTMove)
  c.removeEventListener('touchend',   _onUp)
  window.removeEventListener('resize', _onResize)
}

// ─── Fundo estrelado ─────────────────────────────────────────────────────────
function _addStarfield(rarity) {
  // Cor de acento da nebulosa de acordo com a raridade
  const nebulaColor = rarity === 'gold'
    ? new THREE.Color(0.28, 0.16, 0.04)
    : rarity === 'silver'
    ? new THREE.Color(0.06, 0.08, 0.20)
    : new THREE.Color(0.04, 0.06, 0.22)

  // ── Estrelas pequenas ─────────────────────────────────────────────────────
  const starCount = 320
  const starPos = new Float32Array(starCount * 3)
  const starAlpha = new Float32Array(starCount)
  for (let i = 0; i < starCount; i++) {
    // Espalha numa esfera de raio 18–30 ao redor da câmera
    const theta = Math.random() * Math.PI * 2
    const phi   = Math.acos(2 * Math.random() - 1)
    const r     = 18 + Math.random() * 12
    starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    starPos[i * 3 + 2] = r * Math.cos(phi)
    starAlpha[i] = 0.3 + Math.random() * 0.7
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  starGeo.setAttribute('alpha',    new THREE.BufferAttribute(starAlpha, 1))

  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  })
  scene.add(new THREE.Points(starGeo, starMat))

  // ── Estrelas médias (brilhantes) ─────────────────────────────────────────
  const brightCount = 40
  const brightPos = new Float32Array(brightCount * 3)
  for (let i = 0; i < brightCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi   = Math.acos(2 * Math.random() - 1)
    const r     = 16 + Math.random() * 14
    brightPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    brightPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    brightPos[i * 3 + 2] = r * Math.cos(phi)
  }
  const brightGeo = new THREE.BufferGeometry()
  brightGeo.setAttribute('position', new THREE.BufferAttribute(brightPos, 3))
  const brightMat = new THREE.PointsMaterial({
    color: 0xdde8ff,
    size: 0.13,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  scene.add(new THREE.Points(brightGeo, brightMat))

  // ── Nuvem nebulosa (poucas partículas grandes e difusas com textura circular) ─
  const nebCount = 55
  const nebPos   = new Float32Array(nebCount * 3)
  for (let i = 0; i < nebCount; i++) {
    nebPos[i * 3]     = (Math.random() - 0.5) * 30
    nebPos[i * 3 + 1] = (Math.random() - 0.5) * 20
    nebPos[i * 3 + 2] = -14 - Math.random() * 6
  }
  const nebGeo = new THREE.BufferGeometry()
  nebGeo.setAttribute('position', new THREE.BufferAttribute(nebPos, 3))

  // Textura circular com gradiente radial (evita os quadrados do PointsMaterial)
  const nebCanvas = document.createElement('canvas')
  nebCanvas.width = nebCanvas.height = 64
  const nebCtx = nebCanvas.getContext('2d')
  const grad = nebCtx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0,   'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.4)')
  grad.addColorStop(1,   'rgba(255,255,255,0)')
  nebCtx.fillStyle = grad
  nebCtx.fillRect(0, 0, 64, 64)
  const nebTex = new THREE.CanvasTexture(nebCanvas)

  const nebMat = new THREE.PointsMaterial({
    color: nebulaColor,
    map: nebTex,
    size: 4.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
    alphaTest: 0.01,
  })
  scene.add(new THREE.Points(nebGeo, nebMat))
}

// ─── Texturas auxiliares ──────────────────────────────────────────────────────
function _makeBackTexture() {
  const c = document.createElement('canvas')
  c.width = 300; c.height = 420
  const ctx = c.getContext('2d')

  const g = ctx.createLinearGradient(0, 0, 300, 420)
  g.addColorStop(0, '#0f0c1f')
  g.addColorStop(1, '#0a1628')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 300, 420)

  // borda interna sutil
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 2
  ctx.strokeRect(5, 5, 290, 410)

  // ícone centralizado
  ctx.fillStyle = 'rgba(255,255,255,0.09)'
  ctx.font = '110px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🎵', 150, 210)

  return new THREE.CanvasTexture(c)
}

function _makePlaceholderTexture(rarity) {
  const c = document.createElement('canvas')
  c.width = 300; c.height = 420
  const ctx = c.getContext('2d')

  const [c1, c2] = rarity === 'gold'
    ? ['#78350f', '#d97706']
    : rarity === 'silver'
    ? ['#1e2333', '#4b5563']
    : ['#0c1a38', '#1d4ed8']

  const g = ctx.createLinearGradient(0, 0, 300, 420)
  g.addColorStop(0, c1)
  g.addColorStop(1, c2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 300, 420)

  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.font = '90px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🎵', 150, 210)

  return new THREE.CanvasTexture(c)
}

function _showNoServerMessage() {
  const div = document.createElement('div')
  div.className = 'no-server-msg'
  div.innerHTML =
    'Viewer 3D requer servidor local:<br>' +
    '<code>npm run dev</code><br>' +
    '<small>Rode na pasta do projeto</small>'
  document.getElementById('s-viewer').appendChild(div)
}

function _loadTexture(loader, url, crop = false) {
  return new Promise(resolve => {
    loader.load(
      url,
      tex => {
        tex.colorSpace     = THREE.SRGBColorSpace
        tex.minFilter      = THREE.LinearFilter
        tex.magFilter      = THREE.LinearFilter
        tex.generateMipmaps = false
        // Zoom leve para esconder a borda preta das PNGs (equivalente ao scale(1.03) do CSS)
        if (crop) {
          tex.wrapS  = THREE.ClampToEdgeWrapping
          tex.wrapT  = THREE.ClampToEdgeWrapping
          tex.repeat.set(0.966, 0.966)
          tex.offset.set(0.017, 0.017)
        }
        resolve(tex)
      },
      undefined,
      () => resolve(null)
    )
  })
}
