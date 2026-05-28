/**
 * Visualizador 3D das cartas com shader holográfico.
 * Usa Three.js instalado via npm (não CDN).
 */

import * as THREE from 'three'
import { CARDS_DB, RARITY, CARD_BACKS } from '../config/cards.js'
import { appState, STATE, is } from './state.js'
import { show } from '../ui/screens.js'
import { stopSnippet } from './audio.js'

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

    // Gold fica mais quente e contínuo, sem sparkles pontuais verdes
    vec3 warmBase = vec3(0.78, 0.56, 0.16);
    vec3 goldGlow  = mix(vec3(0.86, 0.72, 0.34), warmBase, sweep);
    vec3 silverGlow = mix(rain * 0.6, vec3(0.90, 0.94, 1.0), 0.35 + fres * 0.25);
    vec3 holo = mix(silverGlow, goldGlow, uWarm);
    holo += fres * (uWarm > 0.5 ? 0.14 : 0.26);
    holo += spec * (uWarm > 0.5 ? 0.05 : 0.09);

    vec3 outCol = tex.rgb + holo * uHolo;
    // Soft highlight roll-off para evitar dourado "amarelo chapado"
    outCol = outCol / (outCol + vec3(1.0));
    outCol = pow(outCol, vec3(0.95));
    gl_FragColor = vec4(outCol, 1.0);
  }
`

// ─── Estado interno do viewer ─────────────────────────────────────────────────
let renderer, scene, camera, cardGroup, raf
let drag = false, prev = { x: 0, y: 0 }, vx = 0, vy = 0

// ─── Abrir viewer ─────────────────────────────────────────────────────────────
export function openViewer(index) {
  if (!is(STATE.FINISHED)) return
  stopSnippet()

  const { pack, rCfg } = appState.revealed[index]
  const def = CARDS_DB[pack.cardId]

  document.getElementById('viewer-label').textContent =
    `${rCfg.label} — ${def.artistName}`

  // Oculta o prize-banner para experiência imersiva no viewer
  document.querySelector('.prize-banner')?.classList.add('viewer-hidden')

  show('s-viewer')
  _init(def.images[pack.rarity], rCfg.holoStrength3d, pack.rarity)
}

// ─── Fechar viewer ────────────────────────────────────────────────────────────
export function closeViewer() {
  cancelAnimationFrame(raf)
  _removeListeners()
  stopSnippet()

  if (renderer) {
    renderer.dispose()
    renderer = null
  }

  document.querySelector('#s-viewer .no-server-msg')?.remove()

  // Restaura o prize-banner
  document.querySelector('.prize-banner')?.classList.remove('viewer-hidden')

  show('s-cards')
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

  const loader = new THREE.TextureLoader()
  const backUrl = CARD_BACKS[rarity] ?? CARD_BACKS.common

  Promise.all([
    _loadTexture(loader, imageUrl),
    _loadTexture(loader, backUrl),
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

// ─── Montar a carta na cena ──────────────────────────────────────────────────
// Usa uma única BoxGeometry com array de materiais — elimina z-fighting completamente.
// Ordem dos materiais no BoxGeometry: +x, -x, +y, -y, +z (frente), -z (verso)
function _buildCard(frontTex, backTex, holoStrength, rarity) {
  const frontMat = new THREE.MeshBasicMaterial({ map: frontTex, side: THREE.FrontSide })

  const backMat  = new THREE.MeshBasicMaterial({ map: backTex, side: THREE.FrontSide })
  const edgeColor = rarity === 'gold' ? 0xb45309 : rarity === 'silver' ? 0x4b5563 : 0x1e3a5f
  const edgeMat  = new THREE.MeshStandardMaterial({ color: edgeColor })

  // Geometria única: sem z-fighting, frente e verso naturalmente separados
  const cardGeo = new THREE.BoxGeometry(2.5, 3.5, 0.04)
  const card    = new THREE.Mesh(cardGeo, [
    edgeMat,  // +x (lateral direita)
    edgeMat,  // -x (lateral esquerda)
    edgeMat,  // +y (topo)
    edgeMat,  // -y (base)
    frontMat, // +z (frente — face da figurinha)
    backMat,  // -z (verso)
  ])

  cardGroup = new THREE.Group()
  cardGroup.add(card)
  cardGroup.rotation.y = -0.35
  scene.add(cardGroup)

  // Partículas douradas flutuantes
  if (rarity === 'gold') {
    // Sem partículas para manter fidelidade total da arte original.
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.45))
  const key = new THREE.DirectionalLight(0xffffff, 0.55)
  key.position.set(3, 3, 5)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xbcd7ff, 0.22)
  fill.position.set(-2.4, -1.8, 3.6)
  scene.add(fill)

  _addListeners()
  window.addEventListener('resize', _onResize)

  const t0 = Date.now()
  ;(function loop() {
    raf = requestAnimationFrame(loop)

    if (!drag) {
      cardGroup.rotation.y += vy
      cardGroup.rotation.x += vx
      vx *= 0.94
      vy *= 0.94
      // auto-rotate suave quando a inércia zera
      if (Math.abs(vy) < 0.001) cardGroup.rotation.y += 0.004
    }
    cardGroup.rotation.x = Math.max(-1.1, Math.min(1.1, cardGroup.rotation.x))
    renderer.render(scene, camera)
  })()
}

// ─── Event listeners de drag ──────────────────────────────────────────────────
function _onDown(e)   {
  drag = true
  vx = 0; vy = 0   // zera inércia ao iniciar toque — evita salto
  prev = { x: e.clientX, y: e.clientY }
}
function _onUp()      { drag = false }
function _onMove(e)   { if (!drag) return; _applyDrag(e.clientX, e.clientY) }
function _onTStart(e) {
  if (e.touches.length !== 1) return
  drag = true
  vx = 0; vy = 0
  prev = { x: e.touches[0].clientX, y: e.touches[0].clientY }
}
function _onTMove(e)  {
  if (!drag || e.touches.length !== 1) return
  _applyDrag(e.touches[0].clientX, e.touches[0].clientY)
}

function _applyDrag(cx, cy) {
  const dx = cx - prev.x, dy = cy - prev.y
  vy = dx * 0.009
  vx = dy * 0.009
  cardGroup.rotation.y += vy
  cardGroup.rotation.x += vx
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

function _loadTexture(loader, url) {
  return new Promise(resolve => {
    loader.load(
      url,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = false
        resolve(tex)
      },
      undefined,
      () => resolve(null)
    )
  })
}
