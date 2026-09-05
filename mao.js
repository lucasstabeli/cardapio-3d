// ---------------------------------------------------------------
// Modo "na minha mão"
//
// O AR nativo (Quick Look / Scene Viewer) so' ancora em planos, entao
// nunca coloca nada na mao. Aqui a camera e' lida direto: o MediaPipe
// acha os pontos da mao e o prato e' desenhado sobre a palma.
//
// A escala continua real: a largura da palma (entre a base do indicador
// e a do mindinho) mede cerca de 8 cm em um adulto, e serve de regua
// para converter metros em pixels na tela.
// ---------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PALMA_M = 0.08;          // largura da palma de um adulto, em metros
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

const tela    = document.querySelector('#mao');
const video   = document.querySelector('#mao-video');
const canvas  = document.querySelector('#mao-canvas');
const estado  = document.querySelector('#mao-estado');
const titulo  = document.querySelector('#mao-titulo');

let renderer, cena, camera, modelo, detector, rodando = false, fluxo = null;

// ---------------------------------------------------------------
function iniciarTres() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  cena = new THREE.Scene();
  cena.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(0.4, 1, 0.6);
  cena.add(sol);
  camera = new THREE.OrthographicCamera(0, 1, 0, 1, -5000, 5000);
}

function ajustarTamanho() {
  const l = tela.clientWidth, a = tela.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(l, a, false);
  // camera em pixels: origem no canto superior esquerdo, Y para baixo
  camera.left = 0; camera.right = l; camera.top = 0; camera.bottom = a;
  camera.updateProjectionMatrix();
}

async function carregarModelo(url) {
  if (modelo) { cena.remove(modelo); modelo = null; }
  const gltf = await new GLTFLoader().loadAsync(url);
  const raiz = gltf.scene;

  // centraliza o modelo na propria origem para poder posicionar pela palma
  const caixa = new THREE.Box3().setFromObject(raiz);
  const centro = caixa.getCenter(new THREE.Vector3());
  raiz.position.sub(centro);

  modelo = new THREE.Group();
  modelo.add(raiz);
  modelo.userData.larguraM = Math.max(
    caixa.max.x - caixa.min.x,
    caixa.max.z - caixa.min.z
  );
  cena.add(modelo);
}

// ---------------------------------------------------------------
async function carregarDetector() {
  if (detector) return detector;
  estado.textContent = 'preparando o detector de mao...';

  const { FilesetResolver, HandLandmarker } = await import(CDN);
  const vision = await FilesetResolver.forVisionTasks(CDN + '/wasm');

  const opcoes = (delegate) => ({
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 1,
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
// O video usa object-fit: cover, entao parte dele fica fora da tela.
// Isto converte coordenadas normalizadas do quadro para pixels visiveis.
function mapaCover() {
  const l = tela.clientWidth, a = tela.clientHeight;
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const escala = Math.max(l / vw, a / vh);
  return {
    para: (nx, ny) => [
      nx * vw * escala - (vw * escala - l) / 2,
      ny * vh * escala - (vh * escala - a) / 2,
    ],
  };
}

function posicionarNaMao(pontos) {
  const m = mapaCover();
  const [pulsoX,  pulsoY]  = m.para(pontos[0].x,  pontos[0].y);
  const [indX,    indY]    = m.para(pontos[5].x,  pontos[5].y);
  const [minX,    minY]    = m.para(pontos[17].x, pontos[17].y);

  const larguraPalmaPx = Math.hypot(indX - minX, indY - minY);
  if (!larguraPalmaPx) return;

  const pxPorMetro = larguraPalmaPx / PALMA_M;

  // centro da palma: media entre pulso e as duas bases dos dedos
  const cx = (pulsoX + indX + minX) / 3;
  const cy = (pulsoY + indY + minY) / 3;

  // o prato assenta um pouco acima do centro da palma
  const alturaPrato = (modelo.userData.larguraM * pxPorMetro) * 0.15;
  modelo.position.set(cx, cy - alturaPrato, 0);
  modelo.scale.setScalar(pxPorMetro);

  // gira o prato acompanhando a inclinacao da mao
  modelo.rotation.z = -Math.atan2(indY - minY, indX - minX);

  estado.textContent =
    'mao encontrada — palma de ' + Math.round(PALMA_M * 100) + ' cm como referencia';
}

function posicaoPadrao() {
  // sem mao a vista: o prato aparece no centro, como se estivesse a' frente
  const l = tela.clientWidth, a = tela.clientHeight;
  const pxPorMetro = (l * 0.55) / modelo.userData.larguraM;
  modelo.position.set(l / 2, a / 2, 0);
  modelo.scale.setScalar(pxPorMetro);
  modelo.rotation.z = 0;
  estado.textContent = 'mostre a palma da mao para o prato pousar nela';
}

// ---------------------------------------------------------------
function laco() {
  if (!rodando) return;
  requestAnimationFrame(laco);
  if (!modelo || video.readyState < 2) return;

  ajustarTamanho();
  modelo.rotation.x = -0.35;   // leve inclinacao para ler como objeto

  try {
    const r = detector.detectForVideo(video, performance.now());
    if (r.landmarks && r.landmarks.length) posicionarNaMao(r.landmarks[0]);
    else posicaoPadrao();
  } catch (e) {
    estado.textContent = 'erro na deteccao: ' + e.message;
  }

  renderer.render(cena, camera);
}

// ---------------------------------------------------------------
export async function abrirMao(prato, urlModelo, fluxoCamera) {
  tela.hidden = false;
  titulo.textContent = prato.nome;
  estado.textContent = 'ligando a camera...';

  fluxo = fluxoCamera;
  video.srcObject = fluxo;
  video.setAttribute('playsinline', '');
  await video.play();

  iniciarTres();
  ajustarTamanho();

  estado.textContent = 'carregando o prato...';
  await carregarModelo(urlModelo);

  try {
    await carregarDetector();
  } catch (e) {
    estado.textContent = 'detector de mao indisponivel: ' + e.message;
  }

  rodando = true;
  laco();
}

export function fecharMao() {
  rodando = false;
  tela.hidden = true;
  if (fluxo) { fluxo.getTracks().forEach((t) => t.stop()); fluxo = null; }
  video.srcObject = null;
}

document.querySelector('#mao-fechar').addEventListener('click', fecharMao);
addEventListener('resize', () => { if (rodando) ajustarTamanho(); });
