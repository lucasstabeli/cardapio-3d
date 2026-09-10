// ---------------------------------------------------------------
// Camera em tamanho real — o prato pousa na superficie apontada
//
// ESTE E' O CAMINHO RESERVA. Desde 10/09/2026 o botao "Ver em tamanho
// real" abre o AR nativo (Quick Look no iPhone, Scene Viewer no Android),
// que ancora de verdade porque quem acha o plano e' o ARKit/ARCore. Este
// arquivo so' entra em aparelho sem AR nativo. Ver app.js.
//
// A camera abre, voce aponta o centro dela para a mesa e o prato pousa ali
// sozinho, no tamanho de verdade. Nao ha' botao de posicionar.
//
//  1. A superficie vem do giroscopio. A gravidade diz para onde e' baixo,
//     entao da' para saber quando o eixo da camera esta' olhando para uma
//     superficie horizontal. Achou, pousa ali. O ponto fica fixo no mundo
//     e nao na tela: girando o aparelho o prato fica onde foi posto.
//
//  2. A distancia ate' essa superficie e' medida UMA vez e trava. E' o que
//     garante tamanho constante: um prato tem um tamanho so' e nao pode
//     crescer nem encolher porque o celular se mexeu.
//
//  3. Os limites, ditos na cara: nao existe deteccao de plano de verdade
//     em pagina web no iPhone. Isto aqui e' um palpite calibrado pela
//     gravidade, nao leitura da cena. E como nao ha' rastreio de
//     translacao, girar o aparelho no lugar funciona, mas andando em
//     volta o prato acompanha voce em vez de ficar parado na mesa.
//
//  4. O modo "na minha mao" (MediaPipe) saiu em 10/09/2026, a pedido do
//     Lucas. Quem quiser de volta, esta' no historico do git.
//
//  5. Por causa do item 3, nao tente fazer este arquivo parecer real. Ele
//     mostra o tamanho; quem faz parecer real e' o AR nativo.
// ---------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FOV_H       = 65;     // abertura horizontal tipica de camera de celular
const ALTURA_MESA = 0.35;   // altura do celular acima da mesa, em metros
const SENO_MESA   = 0.28;   // inclinacao minima (~16 graus) para valer mesa

const tela    = document.querySelector('#cam');
const video   = document.querySelector('#cam-video');
const canvas  = document.querySelector('#cam-canvas');
const estado  = document.querySelector('#cam-estado');
const titulo  = document.querySelector('#cam-titulo');
const mira    = document.querySelector('#cam-mira');

let renderer, cena, camera, modelo, sombra;
let rodando = false, fluxo = null;

// pose desejada (calculada) e pose desenhada (suavizada)
const alvo  = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const atual = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
let temPose = false;
let ultimoQuadro = 0;
let focoPx = 0;                // distancia focal em pixels de tela
let ultimoTexto = '';

// ponto fixo no mundo onde o prato foi pousado, e como ele ficou virado.
// distanciaMesa e' medida uma vez so' e nao muda mais — e' o que segura o
// tamanho do prato quando o celular se mexe.
const ancora = new THREE.Vector3(0, -ALTURA_MESA, -0.6);
const qAncora = new THREE.Quaternion();
let distanciaMesa = 0, pousado = false, foraDesde = 0;

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
function dizer(txt) {
  if (txt === ultimoTexto) return;
  ultimoTexto = txt;
  estado.textContent = txt;
}

function medidaDoPrato() {
  return Math.round(modelo.userData.larguraM * 100) + ' cm';
}

// ---------------------------------------------------------------
// Onde o prato pousa
//
// O centro da camera e' a sonda. Se a gravidade diz que o celular esta'
// inclinado para baixo, o eixo da camera fura uma superficie horizontal,
// e o prato e' pousado ali sozinho — sem botao.
//
// A distancia ate' essa superficie e' medida UMA vez e fica travada. E'
// isso que da' tamanho constante: inclinando o celular, so' a direcao
// muda, entao o prato passeia pelo quadro sem crescer nem encolher.
// ---------------------------------------------------------------
function distanciaDaMesa(frente) {
  // o quanto o prato precisa estar longe para caber inteiro no quadro
  const cabe = modelo.userData.larguraM * focoPx / (tela.clientWidth * 0.9);

  // e o quanto a gravidade diz que a mesa esta'. Vale a maior das duas:
  // um peixe de 45 cm visto a 35 cm nao caberia na tela de jeito nenhum.
  const daGravidade = frente.y < -SENO_MESA ? -ALTURA_MESA / frente.y : 0;
  return Math.min(Math.max(Math.max(cabe, daGravidade), 0.25), 2.5);
}

// vira o prato de lado para quem olha: um peixe de 45 cm apontado para a
// camera vira um ponto, atravessado no quadro mostra o tamanho de verdade
function virarParaQuemOlha(frente) {
  const rasante = new THREE.Vector3(frente.x, 0, frente.z);
  if (rasante.lengthSq() < 1e-6) rasante.set(0, 0, -1);
  rasante.normalize();
  const giro = modelo.userData.comprido === 'z'
    ? Math.atan2(-rasante.z, rasante.x)
    : Math.atan2(-rasante.x, -rasante.z);
  qAncora.setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro);
}

function pousarMesa(frente) {
  // a distancia so' e' medida na primeira vez; depois disso ela e' lei
  if (!distanciaMesa) distanciaMesa = distanciaDaMesa(frente);
  ancora.copy(frente).multiplyScalar(distanciaMesa);
  virarParaQuemOlha(frente);
  pousado = true;
  foraDesde = 0;
}

function alvoNaMesa(agora) {
  const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(qAparelho);

  // ainda procurando: so' pousa quando o centro da camera estiver mesmo
  // olhando para baixo. Sem giroscopio nao ha' como saber, entao pousa
  // do jeito que der e avisa.
  if (!pousado) {
    if (!temGiro) {
      pousarMesa(new THREE.Vector3(0, -Math.tan(12 * Math.PI / 180), -1).normalize());
    } else if (frente.y < -SENO_MESA) {
      pousarMesa(frente);
    } else {
      dizer('aponte o centro da camera para a mesa');
      return false;
    }
  }

  const inverso = qAparelho.clone().invert();
  alvo.pos
    .copy(ancora)
    .applyQuaternion(inverso)
    .addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(inverso),
                     modelo.userData.alturaM / 2);
  alvo.quat.copy(inverso).multiply(qAncora);

  // o prato saiu do quadro? depois de um instante ele e' pousado de novo,
  // na direcao nova mas na MESMA distancia — o tamanho nao muda
  const naTela = alvo.pos.clone().project(camera);
  const dentro = alvo.pos.z < 0 &&
    Math.abs(naTela.x) < 0.85 && Math.abs(naTela.y) < 0.85;
  if (dentro) {
    foraDesde = 0;
  } else if (!foraDesde) {
    foraDesde = agora;
  } else if (agora - foraDesde > 900 && (!temGiro || frente.y < -SENO_MESA)) {
    pousarMesa(frente);
  }

  dizer(temGiro
    ? 'na mesa, ' + medidaDoPrato() + ' no tamanho real'
    : 'a frente (sem giroscopio), ' + medidaDoPrato() + ' no tamanho real');
  return true;
}

// ---------------------------------------------------------------
// Desenho
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

  // enquanto nao achou onde pousar, so' a mira aparece
  const mostrar = alvoNaMesa(agora);
  modelo.visible = mostrar;
  mira.hidden = mostrar;

  if (!mostrar) { renderer.render(cena, camera); return; }

  if (!temPose) {
    atual.pos.copy(alvo.pos);
    atual.quat.copy(alvo.quat);
    temPose = true;
  } else {
    // suavizacao curta de proposito: o prato esta' preso a um ponto do
    // mundo, entao qualquer atraso vira o prato deslizando quando o
    // celular gira. So' o bastante para tirar o tremido do giroscopio.
    atual.pos.lerp(alvo.pos, passo(dt, 0.04));
    atual.quat.slerp(alvo.quat, passo(dt, 0.04));
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

  // primeira leitura de verdade: o que foi pousado antes dela estava num
  // referencial cego, entao o prato e' pousado de novo, agora com gravidade
  if (!temGiro) { temGiro = true; pousado = false; distanciaMesa = 0; }
  const rad = Math.PI / 180;
  const orient = ((screen.orientation && screen.orientation.angle) || 0) * rad;

  giroEuler.set(e.beta * rad, e.alpha * rad, -e.gamma * rad, 'YXZ');
  qAparelho.setFromEuler(giroEuler);
  qAparelho.multiply(meiaVolta);                                  // camera aponta para tras
  qAparelho.multiply(giroAux.setFromAxisAngle(eixoZ, -orient));    // tela deitada
}

// ---------------------------------------------------------------
export async function abrirCamera(prato, urlModelo, fluxoCamera) {
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
  distanciaMesa = 0;
  pousado = false;
  ultimoQuadro = performance.now();
  rodando = true;
  requestAnimationFrame(laco);
}

export function fecharCamera() {
  rodando = false;
  tela.hidden = true;
  removeEventListener('deviceorientation', lerGiro);
  if (fluxo) { fluxo.getTracks().forEach((t) => t.stop()); fluxo = null; }
  video.srcObject = null;
}

document.querySelector('#cam-fechar').addEventListener('click', fecharCamera);
addEventListener('resize', () => { if (rodando) ajustarTamanho(); });
