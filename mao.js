// ---------------------------------------------------------------
// Camera em tamanho real — decide sozinho entre mao e mesa
//
// Uma tela so'. A camera fica aberta e o programa olha o que esta' na
// frente dela a cada quadro:
//
//   ha' uma mao no quadro  -> o prato pousa na palma
//   nao ha' mao            -> o prato pousa na superficie apontada
//
// A troca e' continua: apontou para a mao, o prato vai para a mao;
// apontou para a mesa, ele desce para a mesa. Ninguem escolhe o modo.
//
// Como cada parte funciona:
//
//  1. A mao vem do MediaPipe. A orientacao sai da normal da palma
//     (pulso, base do indicador, base do mindinho), sempre virada para
//     a camera — por isso o prato nao capota quando a mao gira, nem
//     troca de lado entre a mao esquerda e a direita.
//
//  2. A distancia ate' a mao e' medida de verdade: o tamanho da mao em
//     pixels comparado com o tamanho dela em metros (o MediaPipe da' os
//     dois) diz a que profundidade ela esta'. O prato entra na cena com
//     escala 1 — um metro do .glb e' um metro na tela.
//
//  3. A mesa vem do giroscopio. A gravidade diz para onde e' baixo,
//     entao da' para saber onde o eixo da camera fura o plano da mesa.
//     O ponto e' fixado no mundo, nao na tela: girando o aparelho o
//     prato fica onde foi posto.
//
//  4. Deteccao e desenho sao separados. A mao e' procurada uma vez por
//     quadro da camera e o desenho corre a 60 fps atras da pose achada,
//     entao nada pisca nem pula.
// ---------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELO_MAO =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const PALMA_M     = 0.08;   // largura da palma de um adulto, em metros
const FOV_H       = 65;     // abertura horizontal tipica de camera de celular
const ALTURA_MESA = 0.35;   // altura do celular acima da mesa, em metros
const TOLERANCIA_MS = 700;  // tempo que a mao pode sumir antes de virar mesa
const INCLINACAO  = 0.45;   // 0 = o prato segue a palma; 1 = sempre de frente

// ossos usados para medir a mao — a soma de varios e' bem mais estavel
// do que uma medida unica
const OSSOS = [[0, 5], [0, 17], [5, 17], [0, 9], [5, 9], [9, 13], [13, 17]];
const PALMA = [0, 5, 9, 13, 17];   // pontos que formam o centro da palma

const tela    = document.querySelector('#mao');
const video   = document.querySelector('#mao-video');
const canvas  = document.querySelector('#mao-canvas');
const estado  = document.querySelector('#mao-estado');
const titulo  = document.querySelector('#mao-titulo');
const btnFirmar = document.querySelector('#mao-firmar');

let renderer, cena, camera, modelo, sombra, detector;
let rodando = false, fluxo = null;

// pose desejada (da deteccao) e pose desenhada (suavizada)
const alvo  = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const atual = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
let temPose = false;
let modo = 'mesa';             // 'mao' ou 'mesa'
let achadaEm = 0;              // instante em que a mao foi vista pela ultima vez
let ultimoTs = -1;             // os timestamps do MediaPipe tem de crescer
let ultimoQuadro = 0;
let pxPorMetroAnt = 0;
let focoPx = 0;                // distancia focal em pixels de tela
let ultimoTexto = '';

// mesa: ponto fixo no mundo onde o prato foi pousado, e como ele ficou virado
const ancora = new THREE.Vector3(0, -ALTURA_MESA, -0.6);
const qAncora = new THREE.Quaternion();
let mesaFirme = false, precisaAncorar = true, foraDesde = 0;

// giroscopio
const qAparelho = new THREE.Quaternion();
let temGiro = false;

// ---------------------------------------------------------------
// Cena
// ---------------------------------------------------------------
function iniciarTres() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  cena = new THREE.Scene();
  cena.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(0.4, 1, 0.6);
  cena.add(sol);
  // a camera fica parada na origem olhando para -Z; o mundo e' que gira
  camera = new THREE.PerspectiveCamera(55, 1, 0.01, 100);
}

function ajustarTamanho() {
  const l = tela.clientWidth, a = tela.clientHeight;
  const vw = video.videoWidth || l, vh = video.videoHeight || a;

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(l, a, false);

  // o video usa object-fit: cover, entao sobra imagem fora da tela.
  // a mesma escala vale para a distancia focal.
  const cover = Math.max(l / vw, a / vh);
  focoPx = (vw / 2) / Math.tan((FOV_H * Math.PI / 180) / 2) * cover;

  camera.aspect = l / a;
  camera.fov = 2 * Math.atan((a / 2) / focoPx) * 180 / Math.PI;
  camera.updateProjectionMatrix();
}

// mancha escura embaixo do prato: sem ela nada parece encostado na mesa
function fazerSombra(largura) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);

  const malha = new THREE.Mesh(
    new THREE.PlaneGeometry(largura * 1.6, largura * 1.6),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
    })
  );
  malha.rotation.x = -Math.PI / 2;
  return malha;
}

async function carregarModelo(url, larguraCm) {
  if (modelo) { cena.remove(modelo); modelo = null; }
  const gltf = await new GLTFLoader().loadAsync(url);
  const raiz = gltf.scene;

  let caixa = new THREE.Box3().setFromObject(raiz);
  const largura = (c) => Math.max(c.max.x - c.min.x, c.max.z - c.min.z);

  // aqui o tamanho e' o do prato de verdade, nao o que veio no arquivo.
  // Um .glb exportado fora de escala apareceria gigante na mesa.
  if (larguraCm && largura(caixa) > 0) {
    raiz.scale.setScalar((larguraCm / 100) / largura(caixa));
    raiz.updateMatrixWorld(true);
    caixa = new THREE.Box3().setFromObject(raiz);
  }

  // centraliza o modelo na propria origem para posicionar pelo centro
  raiz.position.sub(caixa.getCenter(new THREE.Vector3()));

  modelo = new THREE.Group();
  modelo.add(raiz);
  modelo.userData.larguraM = largura(caixa);
  modelo.userData.alturaM = caixa.max.y - caixa.min.y;
  modelo.userData.comprido =
    caixa.max.z - caixa.min.z > caixa.max.x - caixa.min.x ? 'z' : 'x';

  sombra = fazerSombra(modelo.userData.larguraM);
  sombra.position.y = -modelo.userData.alturaM / 2;
  modelo.add(sombra);

  cena.add(modelo);
}

// ---------------------------------------------------------------
async function carregarDetector() {
  if (detector) return detector;
  dizer('preparando o detector de mao...');

  const { FilesetResolver, HandLandmarker } = await import(CDN);
  const vision = await FilesetResolver.forVisionTasks(CDN + '/wasm');

  const opcoes = (delegate) => ({
    baseOptions: { modelAssetPath: MODELO_MAO, delegate },
    runningMode: 'VIDEO',
    // duas maos: se aparecer mais de uma, fica com a maior (a mais perto)
    numHands: 2,
    // limiares mais baixos que o padrao: a mao continua sendo seguida
    // mesmo virando de lado ou saindo meio do quadro
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  });

  try {
    detector = await HandLandmarker.createFromOptions(vision, opcoes('GPU'));
  } catch (e) {
    // alguns aparelhos recusam o delegate de GPU; a CPU e' mais lenta mas serve
    detector = await HandLandmarker.createFromOptions(vision, opcoes('CPU'));
  }
  return detector;
}

// ---------------------------------------------------------------
function dizer(txt) {
  if (txt === ultimoTexto) return;
  ultimoTexto = txt;
  estado.textContent = txt;
}

// Converte ponto normalizado do quadro para pixel visivel, com Y para cima.
function mapaCover() {
  const l = tela.clientWidth, a = tela.clientHeight;
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const cover = Math.max(l / vw, a / vh);
  return (nx, ny) =>
    new THREE.Vector2(
      nx * vw * cover - (vw * cover - l) / 2,
      a - (ny * vh * cover - (vh * cover - a) / 2)
    );
}

// Entre as maos vistas, a maior e' a que esta' na frente da camera.
function melhorMao(res) {
  const lista = res.landmarks || [];
  let escolha = null, maior = 0;

  for (let i = 0; i < lista.length; i++) {
    const pts = lista[i];
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area > maior) {
      maior = area;
      escolha = { pontos: pts, mundo: res.worldLandmarks && res.worldLandmarks[i] };
    }
  }
  return escolha;
}

// Pontos 3D no sistema do three.js (X direita, Y cima, Z para a camera).
// O MediaPipe usa Y para baixo e Z para longe, dai' os sinais trocados.
function pontos3d(mao) {
  const vw = video.videoWidth || 1;
  const temMundo = !!(mao.mundo && mao.mundo.length);
  const fonte = temMundo ? mao.mundo : mao.pontos;
  const k = temMundo ? 1 : vw;   // sem os pontos em metros, a conta e' em pixels
  return fonte.map((p) => new THREE.Vector3(p.x * k, -p.y * k, -p.z * k));
}

// Quantos pixels vale um metro na distancia em que a mao esta'. Comparando
// o tamanho da mao em pixels com o tamanho dela em metros — os dois
// projetados em X e Y — a inclinacao encurta os dois igual e sai da conta.
function medirEscala(v2, mundo, larguraPalmaPx) {
  let somaPx = 0, somaM = 0;

  if (mundo && mundo.length) {
    for (const [a, b] of OSSOS) {
      somaPx += v2[a].distanceTo(v2[b]);
      somaM += Math.hypot(mundo[a].x - mundo[b].x, mundo[a].y - mundo[b].y);
    }
  }

  let px = somaM > 0.05 ? somaPx / somaM : 0;

  // sem pontos em metros (ou mao muito de lado), volta para a palma de 8 cm
  if (!px && larguraPalmaPx) px = larguraPalmaPx / PALMA_M;
  if (!px) return pxPorMetroAnt;

  // uma mao fica entre 12 cm e 1,2 m da camera; fora disso e' leitura ruim
  px = Math.min(Math.max(px, focoPx / 1.2), focoPx / 0.12);

  // e nada de saltos de escala entre um quadro e outro
  if (pxPorMetroAnt) {
    px = Math.min(Math.max(px, pxPorMetroAnt * 0.6), pxPorMetroAnt * 1.6);
  }
  pxPorMetroAnt = px;
  return px;
}

const PARA_CAMERA = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------
// Alvo quando ha' uma mao
// ---------------------------------------------------------------
function alvoNaMao(mao) {
  const mapa = mapaCover();
  const v2 = mao.pontos.map((p) => mapa(p.x, p.y));
  const v3 = pontos3d(mao);

  const pxPorMetro = medirEscala(v2, mao.mundo, v2[5].distanceTo(v2[17]));
  if (!pxPorMetro || !focoPx) return false;

  // ---- para onde a palma esta' virada ----------------------------
  const a1 = new THREE.Vector3().subVectors(v3[5], v3[0]);
  const a2 = new THREE.Vector3().subVectors(v3[17], v3[0]);
  const normal = new THREE.Vector3().crossVectors(a1, a2);
  if (normal.lengthSq() < 1e-12) return false;
  normal.normalize();

  // sempre para o lado da camera. E' isto que impede o prato de virar
  // de cabeca para baixo quando a mao gira ou troca de lado.
  if (normal.z < 0) normal.negate();

  // mistura com a direcao da camera: acompanha a mao, mas continua
  // legivel quando a palma fica muito de lado
  const cima = normal.clone().lerp(PARA_CAMERA, INCLINACAO).normalize();

  // o comprimento do prato segue a direcao pulso -> base do dedo medio
  const frente = new THREE.Vector3().subVectors(v3[9], v3[0]).projectOnPlane(cima);
  if (frente.lengthSq() < 1e-9) frente.set(0, 1, 0).projectOnPlane(cima);
  frente.normalize();

  const tras = frente.clone().negate();
  const lado = new THREE.Vector3().crossVectors(cima, tras).normalize();
  alvo.quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lado, cima, tras));

  // ---- a que distancia a mao esta' --------------------------------
  const centro = new THREE.Vector2();
  for (const i of PALMA) centro.add(v2[i]);
  centro.divideScalar(PALMA.length);

  const fundo = focoPx / pxPorMetro;          // metros ate' a palma
  const l = tela.clientWidth, a = tela.clientHeight;
  alvo.pos.set(
    (centro.x - l / 2) / focoPx * fundo,
    (centro.y - a / 2) / focoPx * fundo,
    -fundo
  );
  // sobe meia altura do modelo pela normal: a base fica sobre a palma
  alvo.pos.addScaledVector(cima, modelo.userData.alturaM / 2);

  if (modelo.userData.larguraM * pxPorMetro > tela.clientWidth * 1.15) {
    dizer('na sua mao — afaste o celular para ver o prato inteiro');
  } else {
    dizer('na sua mao — ' + Math.round(fundo * 100) + ' cm da camera');
  }
  return true;
}

// ---------------------------------------------------------------
// Alvo quando nao ha' mao: a superficie apontada
// ---------------------------------------------------------------
function ancorarMesa() {
  const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(qAparelho);

  // o eixo da camera fura o plano da mesa se estiver apontando para baixo
  if (frente.y < -0.2) {
    const t = Math.min(Math.max(-ALTURA_MESA / frente.y, 0.25), 2);
    ancora.copy(frente).multiplyScalar(t);
    ancora.y = -ALTURA_MESA;
    mesaFirme = true;
  } else {
    // camera na horizontal (ou sem giroscopio): nao da' para saber onde
    // esta' a mesa, entao o prato fica 12 graus abaixo do eixo, na
    // distancia em que ele cabe no quadro. Assim aparece embaixo, inteiro.
    const l = tela.clientWidth;
    const cabe = Math.min(
      Math.max(modelo.userData.larguraM * focoPx / (l * 0.65), 0.3), 2
    );
    const passo = new THREE.Vector3(0, -Math.tan(12 * Math.PI / 180), -1)
      .normalize()
      .multiplyScalar(cabe)
      .applyQuaternion(qAparelho);
    ancora.copy(passo);
    mesaFirme = false;
  }

  // vira o prato de lado para quem olha: um peixe de 45 cm apontado para a
  // camera vira um ponto, atravessado no quadro mostra o tamanho de verdade
  const rasante = new THREE.Vector3(frente.x, 0, frente.z);
  if (rasante.lengthSq() < 1e-6) rasante.set(0, 0, -1);
  rasante.normalize();
  const giro = modelo.userData.comprido === 'z'
    ? Math.atan2(-rasante.z, rasante.x)
    : Math.atan2(-rasante.x, -rasante.z);
  qAncora.setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro);

  precisaAncorar = false;
  foraDesde = 0;
}

function alvoNaMesa(agora) {
  if (precisaAncorar) ancorarMesa();

  const inverso = qAparelho.clone().invert();
  alvo.pos
    .copy(ancora)
    .setY(ancora.y + modelo.userData.alturaM / 2)
    .applyQuaternion(inverso);
  alvo.quat.copy(inverso).multiply(qAncora);

  // o prato saiu do quadro? depois de um instante ele e' pousado de novo
  const naTela = alvo.pos.clone().project(camera);
  const dentro = alvo.pos.z < 0 &&
    Math.abs(naTela.x) < 1.1 && Math.abs(naTela.y) < 1.1;
  if (dentro) {
    foraDesde = 0;
  } else if (!foraDesde) {
    foraDesde = agora;
  } else if (agora - foraDesde > 900) {
    precisaAncorar = true;
  }

  // um prato grande visto de perto nao cabe no quadro — e' o tamanho certo,
  // so' falta espaco
  const larguraPx = modelo.userData.larguraM * focoPx / Math.max(-alvo.pos.z, 0.05);

  if (!detector) dizer('na superficie a frente — preparando a deteccao de mao...');
  else if (larguraPx > tela.clientWidth * 1.15) dizer('afaste o celular para ver o prato inteiro');
  else if (!temGiro) dizer('na superficie a frente — mostre a mao para pegar o prato');
  else if (mesaFirme) dizer('na mesa — mostre a mao para o prato ir para a palma');
  else dizer('incline o celular para baixo, na direcao da mesa');
}

// ---------------------------------------------------------------
// Deteccao: uma vez por quadro da camera
// ---------------------------------------------------------------
function agendarDeteccao() {
  if (!rodando) return;
  if (video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(detectar);
  } else {
    setTimeout(() => detectar(performance.now(), null), 33);
  }
}

function detectar(agora, meta) {
  if (!rodando) return;
  agendarDeteccao();
  if (!detector || !modelo || video.readyState < 2) return;

  let ts = meta ? meta.mediaTime * 1000 : agora;
  if (!(ts > ultimoTs)) ts = ultimoTs + 1;   // o MediaPipe recusa repetido
  ultimoTs = ts;

  try {
    const r = detector.detectForVideo(video, ts);
    const mao = melhorMao(r);
    if (mao && alvoNaMao(mao)) {
      achadaEm = performance.now();
      if (modo !== 'mao') { modo = 'mao'; precisaAncorar = true; }
    }
  } catch (e) {
    dizer('erro na deteccao: ' + e.message);
  }
}

// ---------------------------------------------------------------
// Desenho: 60 fps atras da pose encontrada
// ---------------------------------------------------------------
function passo(dt, tau) {
  return 1 - Math.exp(-dt / tau);
}

function laco(agora) {
  if (!rodando) return;
  requestAnimationFrame(laco);
  if (!modelo || video.readyState < 2) return;

  const dt = Math.min((agora - ultimoQuadro) / 1000 || 0.016, 0.1);
  ultimoQuadro = agora;
  ajustarTamanho();

  // a mao sumiu ha' um tempo: o prato desce para a superficie apontada
  if (agora - achadaEm > TOLERANCIA_MS) {
    modo = 'mesa';
    alvoNaMesa(agora);
  }

  sombra.visible = modo === 'mesa';
  btnFirmar.hidden = modo !== 'mesa';

  if (!temPose) {
    atual.pos.copy(alvo.pos);
    atual.quat.copy(alvo.quat);
    temPose = true;
  } else {
    // a troca entre mao e mesa e' um pulo grande; um pouco mais lenta
    // fica parecendo que o prato foi levantado da mesa
    atual.pos.lerp(alvo.pos, passo(dt, 0.09));
    atual.quat.slerp(alvo.quat, passo(dt, 0.11));
  }

  modelo.position.copy(atual.pos);
  modelo.quaternion.copy(atual.quat);

  renderer.render(cena, camera);
}

// ---------------------------------------------------------------
// Giroscopio
// ---------------------------------------------------------------
const eixoZ = new THREE.Vector3(0, 0, 1);
const meiaVolta = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const giroEuler = new THREE.Euler();
const giroAux = new THREE.Quaternion();

function lerGiro(e) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  temGiro = true;
  const rad = Math.PI / 180;
  const orient = ((screen.orientation && screen.orientation.angle) || 0) * rad;

  giroEuler.set(e.beta * rad, e.alpha * rad, -e.gamma * rad, 'YXZ');
  qAparelho.setFromEuler(giroEuler);
  qAparelho.multiply(meiaVolta);                                  // camera aponta para tras
  qAparelho.multiply(giroAux.setFromAxisAngle(eixoZ, -orient));    // tela deitada
}

// ---------------------------------------------------------------
export async function abrirMao(prato, urlModelo, fluxoCamera) {
  tela.hidden = false;
  titulo.textContent = prato.nome;
  ultimoTexto = '';
  dizer('ligando a camera...');

  fluxo = fluxoCamera;
  video.srcObject = fluxo;
  video.setAttribute('playsinline', '');
  await video.play();

  iniciarTres();
  ajustarTamanho();

  dizer('carregando o prato...');
  await carregarModelo(urlModelo, prato.larguraCm);

  addEventListener('deviceorientation', lerGiro);

  temPose = false;
  modo = 'mesa';
  achadaEm = 0;
  ultimoTs = -1;
  pxPorMetroAnt = 0;
  precisaAncorar = true;
  ultimoQuadro = performance.now();
  rodando = true;
  requestAnimationFrame(laco);

  // o detector vem depois, sem segurar a tela: o prato ja' aparece na
  // mesa enquanto ele baixa, e a mao passa a ser procurada quando chega
  carregarDetector()
    .then(agendarDeteccao)
    .catch((e) => dizer('nao consegui carregar o detector de mao: ' + e.message));
}

export function fecharMao() {
  rodando = false;
  tela.hidden = true;
  removeEventListener('deviceorientation', lerGiro);
  if (fluxo) { fluxo.getTracks().forEach((t) => t.stop()); fluxo = null; }
  video.srcObject = null;
}

document.querySelector('#mao-fechar').addEventListener('click', fecharMao);
btnFirmar.addEventListener('click', () => { precisaAncorar = true; });
addEventListener('resize', () => { if (rodando) ajustarTamanho(); });
