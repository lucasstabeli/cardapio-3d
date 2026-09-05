// ---------------------------------------------------------------
// Cardápio 3D — dados dos pratos
//
// modelo   : caminho do .glb  (Android + visualização na web)
// modeloIos: caminho do .usdz (iPhone). Se ficar vazio, o model-viewer
//            gera um USDZ automaticamente a partir do .glb.
// larguraCm: largura real do prato no mundo real, em centímetros.
//            Serve para conferir se o 3D está na escala certa.
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
    modeloIos: '',
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
    modeloIos: '',
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
    modeloIos: '',
    larguraCm: 45,
  },
];

// ---------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const grade   = $('#grade');
const filtros = $('#filtros');
const folha   = $('#folha');
const mv      = $('#mv');
const btnAr   = $('#btn-ar');
const aviso   = $('#aviso');
const medidas = $('#medidas');
const spinner = $('#spinner');

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
function abrir(prato) {
  $('#f-nome').textContent = prato.nome;
  $('#f-preco').textContent = brl.format(prato.preco);
  $('#f-desc').textContent = prato.desc;

  medidas.hidden = true;
  medidas.classList.remove('ruim');
  spinner.hidden = false;

  mv.alt = prato.nome;
  mv.dataset.larguraCm = prato.larguraCm ?? '';
  if (prato.modeloIos) mv.setAttribute('ios-src', prato.modeloIos);
  else mv.removeAttribute('ios-src');
  mv.src = prato.modelo;

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
// O tamanho real no AR vem do próprio arquivo .glb: 1 unidade = 1 metro.
// Se o modelo foi exportado fora de escala, ele aparece gigante ou minúsculo
// na mesa. Este bloco mede o modelo carregado e avisa quando não bate com
// a largura real informada em PRATOS.
// ---------------------------------------------------------------
mv.addEventListener('load', () => {
  spinner.hidden = true;
  const d = mv.getDimensions();              // metros
  const cm = (v) => Math.round(v * 100);
  const larguraModelo = Math.max(d.x, d.z);  // maior lado na horizontal
  const esperado = Number(mv.dataset.larguraCm);

  let txt = `Tamanho no AR: <b>${cm(d.x)} × ${cm(d.z)} × ${cm(d.y)} cm</b> (L×P×A)`;
  medidas.classList.remove('ruim');

  if (esperado) {
    const fator = (esperado / 100) / larguraModelo;
    if (fator < 0.8 || fator > 1.25) {
      medidas.classList.add('ruim');
      txt += `<br>Fora de escala — o real tem ~${esperado} cm. ` +
             `Reescale o .glb por <b>${Number(fator.toPrecision(3))}×</b>.`;
    }
  }

  medidas.innerHTML = txt;
  medidas.hidden = false;
});

// ---------------------------------------------------------------
// Botão de AR
// ---------------------------------------------------------------
function estadoAr() {
  if (mv.canActivateAR) {
    btnAr.hidden = false;
    aviso.hidden = true;
  } else {
    btnAr.hidden = true;
    aviso.hidden = false;
    aviso.textContent = location.protocol === 'https:' || location.hostname === 'localhost'
      ? 'Este aparelho não abre a câmera em AR. Abra o cardápio no celular (Safari no iPhone, Chrome no Android) para ver o prato na mesa.'
      : 'O AR só funciona em HTTPS. Publique o site ou use um túnel HTTPS para testar no celular.';
  }
}

btnAr.addEventListener('click', () => mv.activateAR());
mv.addEventListener('ar-status', (e) => {
  if (e.detail.status === 'failed') {
    aviso.hidden = false;
    aviso.textContent = 'Não deu para abrir o AR neste aparelho.';
  }
});
mv.addEventListener('load', estadoAr);
customElements.whenDefined('model-viewer').then(estadoAr);

// ---------------------------------------------------------------
montarFiltros();
montarGrade();

// ---------------------------------------------------------------
// Diagnóstico — abra a página com ?debug=1 para ver o que o
// aparelho suporta e qual modo de AR foi realmente acionado.
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

  let webxr = 'nao';
  try {
    if (navigator.xr) {
      webxr = (await navigator.xr.isSessionSupported('immersive-ar')) ? 'sim' : 'nao';
    }
  } catch (e) {
    webxr = 'erro: ' + e.message;
  }

  const ua = navigator.userAgent;
  caixaDiag.textContent = [
    `aparelho   : ${/iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : 'outro'}`,
    `navegador  : ${/CriOS/.test(ua) ? 'Chrome iOS' : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' : /Chrome/.test(ua) ? 'Chrome' : '?'}`,
    `https      : ${location.protocol === 'https:' ? 'sim' : 'NAO'}`,
    `webxr AR   : ${webxr}`,
    `pode abrir : ${mv.canActivateAR}`,
    `ar-modes   : ${mv.getAttribute('ar-modes')}`,
    `eventos    : ${eventosAr.join(' > ') || '(nenhum)'}`,
    `ua         : ${ua}`,
  ].join(`
`);

  caixaDiag.addEventListener('click', () => {
    navigator.clipboard?.writeText(caixaDiag.textContent);
    caixaDiag.style.borderTopColor = '#8ef58e';
  });
}

// guarda os eventos de AR desde o começo, mesmo com o painel fechado
const eventosAr = [];
mv.addEventListener('ar-status', (e) => {
  eventosAr.push(e.detail.status);
  if (caixaDiag) { caixaDiag.remove(); caixaDiag = null; mostrarDiagnostico(); }
});

$('#abrir-diag').addEventListener('click', mostrarDiagnostico);
if (new URLSearchParams(location.search).has('debug')) mostrarDiagnostico();
