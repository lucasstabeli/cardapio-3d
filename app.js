// ---------------------------------------------------------------
// Cardápio 3D — dados dos pratos
//
// modelo   : caminho do .glb, usado tanto na ficha quanto na câmera.
// larguraCm: largura real do prato no mundo real, em centímetros. É ela
//            que define o tamanho na câmera — o .glb pode vir em qualquer
//            escala que o prato aparece do tamanho certo.
// ---------------------------------------------------------------
const PRATOS = [
  {
    id: 'espetinho',
    nome: 'Espetinho da Casa',
    categoria: 'Grelhados',
    preco: 32.9,
    desc: 'Cubos de picanha, pimentão e cebola grelhados na brasa, servidos no espeto.',
    emoji: '🍢',
    cor: '#3a2a1e',
    modelo: 'assets/models/espetinho.glb',
    larguraCm: 30,
  },
  {
    id: 'guacamole',
    nome: 'Abacate Recheado',
    categoria: 'Entradas',
    preco: 24.0,
    desc: 'Meio abacate maduro com camarão ao limão e coentro.',
    emoji: '🥑',
    cor: '#22301f',
    modelo: 'assets/models/abacate.glb',
    larguraCm: 9,
  },
  {
    id: 'peixe',
    nome: 'Peixe Grelhado Inteiro',
    categoria: 'Peixes',
    preco: 89.9,
    desc: 'Peixe fresco do dia grelhado inteiro, com legumes salteados e limão siciliano.',
    emoji: '🐟',
    cor: '#1e2b33',
    modelo: 'assets/models/peixe.glb',
    larguraCm: 45,
  },
];

// ---------------------------------------------------------------
// Suba este numero sempre que um .glb mudar. Sem isso o navegador
// continua usando o arquivo antigo que ja' baixou.
const VERSAO_MODELOS = 2;

const $ = (s) => document.querySelector(s);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const grade   = $('#grade');
const filtros = $('#filtros');
const folha   = $('#folha');
const mv      = $('#mv');
const aviso   = $('#aviso');
const medidas = $('#medidas');
const spinner = $('#spinner');
const dicaAr  = $('#dica-ar');
const btnVer  = $('#btn-ver');

// a camera propria e' a reserva: entra so' onde nao ha' AR nativo
const TEM_CAMERA = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

let categoriaAtiva = 'Todos';

// ---------------------------------------------------------------
// Cardápio
// ---------------------------------------------------------------
function montarFiltros() {
  const cats = ['Todos', ...new Set(PRATOS.map((p) => p.categoria))];
  filtros.innerHTML = cats
    .map(
      (c) =>
        `<button data-cat="${c}" aria-pressed="${c === categoriaAtiva}">${c}</button>`
    )
    .join('');
}

function montarGrade() {
  const lista =
    categoriaAtiva === 'Todos'
      ? PRATOS
      : PRATOS.filter((p) => p.categoria === categoriaAtiva);

  grade.innerHTML = lista
    .map(
      (p) => `
      <button class="card" data-id="${p.id}">
        <div class="thumb" style="background:linear-gradient(160deg,${p.cor},#141110)">
          ${p.emoji}
          <span class="selo">
            <svg viewBox="0 0 24 24"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5z"/></svg>3D
          </span>
        </div>
        <div class="card-corpo">
          <h3>${p.nome}</h3>
          <p class="p">${brl.format(p.preco)}</p>
        </div>
      </button>`
    )
    .join('');
}

filtros.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  categoriaAtiva = b.dataset.cat;
  montarFiltros();
  montarGrade();
});

grade.addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (c) abrir(PRATOS.find((p) => p.id === c.dataset.id));
});

// ---------------------------------------------------------------
// Tela do prato
// ---------------------------------------------------------------
let pratoAtual = null;

function abrir(prato) {
  pratoAtual = prato;
  $('#f-nome').textContent = prato.nome;
  $('#f-preco').textContent = brl.format(prato.preco);
  $('#f-desc').textContent = prato.desc;

  medidas.hidden = true;
  medidas.classList.remove('ruim');
  spinner.hidden = false;

  mv.alt = prato.nome;
  mv.dataset.larguraCm = prato.larguraCm ?? '';
  mv.src = prato.modelo + `?v=${VERSAO_MODELOS}`;

  folha.hidden = false;
  document.body.style.overflow = 'hidden';
  estadoAr();
}

function fechar() {
  folha.hidden = true;
  mv.src = '';
  document.body.style.overflow = '';
}

$('#fechar').addEventListener('click', fechar);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !folha.hidden) fechar();
});

// ---------------------------------------------------------------
// Conferência de escala
//
// No .glb, 1 unidade = 1 metro. A câmera já corrige o tamanho pela largura
// real declarada em PRATOS, então um arquivo fora de escala não quebra mais
// nada — mas continua sendo um arquivo errado. Este bloco mede o que foi
// carregado e avisa quando as duas medidas não batem.
// ---------------------------------------------------------------
mv.addEventListener('load', () => {
  spinner.hidden = true;
  const d = mv.getDimensions();              // metros
  const cm = (v) => Math.round(v * 100);
  const larguraModelo = Math.max(d.x, d.z);  // maior lado na horizontal
  const esperado = Number(mv.dataset.larguraCm);

  let txt = `Arquivo 3D: <b>${cm(d.x)} × ${cm(d.z)} × ${cm(d.y)} cm</b> (L×P×A)`;
  medidas.classList.remove('ruim');

  if (esperado) {
    const fator = (esperado / 100) / larguraModelo;
    if (fator < 0.8 || fator > 1.25) {
      medidas.classList.add('ruim');
      txt += `<br>O real tem ~${esperado} cm — a câmera usa essa medida. ` +
             `Para acertar o arquivo, reescale por <b>${Number(fator.toPrecision(3))}×</b>.`;
    }
  }

  medidas.innerHTML = txt;
  medidas.hidden = false;
});

// ---------------------------------------------------------------
// Botões
//
// Um botão só para o cliente, dois caminhos por baixo dele.
//
//  1. AR nativo — Quick Look no iPhone, Scene Viewer no Android. É o único
//     que enxerga a mesa de verdade: o ARKit/ARCore acha o plano, ancora o
//     prato no mundo e desenha sombra de contato. Dá para andar em volta
//     que ele fica onde foi posto. Preferido sempre que existir.
//
//  2. Câmera própria (camera.js) — reserva para aparelho sem AR nativo.
//     Ela adivinha a mesa pelo giroscópio: girando o celular funciona, mas
//     andando o prato acompanha. Serve para dar a ideia do tamanho.
//
// O AR nativo tinha saído em 677864e, e o motivo era o modo "na minha mão":
// Quick Look e Scene Viewer só ancoram em plano e nunca pousariam nada na
// palma. O modo mão saiu em 10/09/2026 e levou esse motivo junto.
//
// O ar-scale e' "fixed" de proposito: o prato tem um tamanho so' e o
// cliente nao deve poder esticar. Isso exige .glb na escala certa — os
// tres estao, conferidos com ferramentas/escalar_glb.py.
// ---------------------------------------------------------------
const DICA = {
  nativo:
    'Aponte a câmera para a <b>mesa</b> e mova o celular devagar até o ' +
    'aparelho reconhecer a superfície. O prato pousa ali <b>ancorado</b>, ' +
    'no tamanho real — dá para andar em volta e ver de todos os lados.',
  proprio:
    'Aponte o centro da câmera para a <b>mesa</b>: o prato pousa ali ' +
    'sozinho, no tamanho real. Neste aparelho a posição vem do giroscópio, ' +
    'então gire o celular à vontade, mas <b>fique no lugar</b> — andando, ' +
    'o prato acompanha você.',
};

let caminhoAr = 'nenhum';

function estadoAr() {
  // canActivateAR so' fica verdadeiro depois que o model-viewer carrega o
  // modelo e confere o suporte do aparelho; por isso estadoAr e' chamado
  // de novo no load.
  caminhoAr = mv.canActivateAR ? 'nativo' : TEM_CAMERA ? 'proprio' : 'nenhum';

  btnVer.hidden = caminhoAr === 'nenhum';
  dicaAr.hidden = caminhoAr === 'nenhum';
  aviso.hidden = caminhoAr !== 'nenhum';

  if (caminhoAr !== 'nenhum') {
    dicaAr.innerHTML = DICA[caminhoAr];
    return;
  }

  aviso.textContent = location.protocol === 'https:' || location.hostname === 'localhost'
    ? 'Este aparelho não abre a câmera. Abra o cardápio no celular (Safari no iPhone, Chrome no Android) para ver o prato em tamanho real.'
    : 'A câmera só funciona em HTTPS. Publique o site ou use um túnel HTTPS para testar no celular.';
}

// ---------------------------------------------------------------
// A camera propria: o Safari do iPhone so' libera camera e giroscopio se
// os dois forem pedidos dentro do gesto do usuario. Por isso os dois
// pedidos saem juntos, antes de qualquer await, e o modulo vem depois.
// ---------------------------------------------------------------
async function abrirCameraPropria() {
  const pedidoCamera = navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 } },
    audio: false,
  });
  const pedidoGiro =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
      ? DeviceOrientationEvent.requestPermission().catch(() => 'denied')
      : Promise.resolve('granted');

  let fluxo;
  try {
    fluxo = await pedidoCamera;
  } catch (e) {
    aviso.hidden = false;
    aviso.textContent =
      'Nao consegui abrir a camera (' + e.name + '). ' +
      'Toque em "aA" na barra de endereco > Configuracoes do Site > Camera > Permitir.';
    return;
  }
  // sem o giroscopio o prato ainda aparece, so' nao fica preso na mesa
  await pedidoGiro;

  const { abrirCamera } = await import('./camera.js?v=10');
  await abrirCamera(pratoAtual, pratoAtual.modelo + `?v=${VERSAO_MODELOS}`, fluxo);
}

btnVer.addEventListener('click', async () => {
  if (caminhoAr === 'nativo') {
    try {
      await mv.activateAR();
      return;
    } catch (e) {
      // o aparelho prometeu AR e nao entregou: cai para a camera propria
      // em vez de deixar o botao sem resposta
      if (!TEM_CAMERA) {
        aviso.hidden = false;
        aviso.textContent = 'Nao consegui abrir o AR deste aparelho (' + e.name + ').';
        return;
      }
      caminhoAr = 'proprio';
      dicaAr.innerHTML = DICA.proprio;
    }
  }
  if (caminhoAr === 'proprio') await abrirCameraPropria();
});

mv.addEventListener('load', estadoAr);
customElements.whenDefined('model-viewer').then(estadoAr);

// ---------------------------------------------------------------
montarFiltros();
montarGrade();

// ---------------------------------------------------------------
// Diagnóstico — abra a página com ?debug=1 para ver por qual caminho o
// prato vai aparecer. "ar nativo: sim" é o bom: quem ancora é o ARKit ou
// o ARCore. Caindo para a câmera própria, aí sim importam câmera e
// giroscópio — sem ele o prato aparece à frente em vez de na mesa.
// ---------------------------------------------------------------
let caixaDiag = null;

async function mostrarDiagnostico() {
  if (caixaDiag) {                 // já aberto -> fecha
    caixaDiag.remove();
    caixaDiag = null;
    return;
  }

  caixaDiag = document.createElement('pre');
  caixaDiag.className = 'debug';
  document.body.appendChild(caixaDiag);

  // o giroscopio so' se conhece ouvindo: da' um instante para ele falar
  const giro = await new Promise((ok) => {
    let resposta = 'nao respondeu';
    const ouvir = (e) => {
      resposta = e.beta == null ? 'evento sem angulo' : 'sim';
      pronto();
    };
    const pronto = () => {
      removeEventListener('deviceorientation', ouvir);
      clearTimeout(prazo);
      ok(resposta);
    };
    addEventListener('deviceorientation', ouvir);
    const prazo = setTimeout(pronto, 700);
  });

  const ua = navigator.userAgent;
  caixaDiag.textContent = [
    `aparelho   : ${/iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : 'outro'}`,
    `navegador  : ${/CriOS/.test(ua) ? 'Chrome iOS' : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' : /Chrome/.test(ua) ? 'Chrome' : '?'}`,
    `https      : ${location.protocol === 'https:' ? 'sim' : 'NAO'}`,
    `ar nativo  : ${mv.canActivateAR ? 'sim (' + (mv.arModes || '') + ')' : 'NAO'}`,
    `caminho    : ${caminhoAr}`,
    `camera     : ${TEM_CAMERA ? 'sim' : 'NAO'}`,
    `giroscopio : ${giro}`,
    `pede permis: ${typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function' ? 'sim (iOS)' : 'nao'}`,
    `ua         : ${ua}`,
  ].join(`
`);

  caixaDiag.addEventListener('click', () => {
    navigator.clipboard?.writeText(caixaDiag.textContent);
    caixaDiag.style.borderTopColor = '#8ef58e';
  });
}

$('#abrir-diag').addEventListener('click', mostrarDiagnostico);
if (new URLSearchParams(location.search).has('debug')) mostrarDiagnostico();
