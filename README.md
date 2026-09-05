# Cardápio 3D

Cardápio web onde o cliente toca num prato, abre a câmera e vê a comida
**em tamanho real na mesa dele**. Sem instalar app.

## Como funciona o AR

Usa o `<model-viewer>` do Google, que aciona o AR nativo de cada sistema:

| Aparelho | Tecnologia acionada | Arquivo usado |
|---|---|---|
| Android (Chrome) | Google Scene Viewer | `.glb` |
| iPhone (Safari) | Apple AR Quick Look | `.usdz` |

No iPhone, se o `.usdz` não for informado, o `model-viewer` gera um a partir
do `.glb` automaticamente. Funciona, mas um `.usdz` feito à mão fica melhor.

O atributo `ar-scale="fixed"` impede o cliente de redimensionar o prato com
os dedos — é isso que garante que o tamanho visto seja o tamanho real.

## Rodando

```bash
python -m http.server 5173
```

Abra <http://localhost:5173>.

**No computador o AR não abre** — só dá para girar o modelo. A câmera exige
HTTPS, então o teste de verdade é sempre pelo celular.

## No ar

<https://lucasstabeli.github.io/cardapio-3d/>

Publicado no GitHub Pages a partir da branch `main`. Todo push republica
sozinho, em cerca de um minuto. HTTPS é obrigatório e o próprio Pages força.

## Dois modos de ver

**Na mesa** — usa o AR nativo (Quick Look no iPhone, Scene Viewer no Android).
Ancora de verdade na superfície: você anda em volta e o prato fica parado.
Só funciona em superfície plana; não pousa na mão, porque esses
visualizadores detectam planos e mais nada.

**Na mão** (`mao.js`) — lê a câmera direto e usa o MediaPipe para achar os
pontos da mão, desenhando o prato sobre a palma. A largura da palma
(~8 cm) serve de régua para converter metros em pixels, então a escala
continua real. Não tem profundidade verdadeira: é composição sobre a
imagem, não ancoragem 3D. Em compensação funciona onde o AR nativo não vai.

## A escala é o ponto crítico

No AR, **1 unidade do `.glb` = 1 metro**. Modelo exportado fora dessa escala
vira um espetinho de 112 metros na mesa do cliente — foi o caso do arquivo de
exemplo original.

Por isso a tela do prato mostra uma etiqueta com o tamanho medido. Se estiver
fora do esperado, ela avisa e informa o fator de correção. Aí é só rodar:

```bash
python ferramentas/escalar_glb.py assets/models/prato.glb 0.267
```

Isso gera `prato_escalado.glb` sem mexer no original, na geometria ou nas
texturas. O valor esperado de cada prato vem do campo `larguraCm` em `app.js`
— meça o prato real com uma régua e coloque ali.

## Cadastrando um prato

Em [`app.js`](app.js), na lista `PRATOS`:

```js
{
  id: 'moqueca',
  nome: 'Moqueca de Camarão',
  categoria: 'Peixes',
  preco: 98.0,
  desc: 'Camarão, leite de coco e dendê, servida na panela de barro.',
  emoji: '🦐',
  cor: '#33221e',
  modelo: 'assets/models/moqueca.glb',
  modeloIos: '',        // opcional; vazio = gerado a partir do .glb
  larguraCm: 28,        // largura real, medida com régua
}
```

## Arquivos

```
index.html                    estrutura da página e do visor 3D
styles.css                    visual
app.js                        dados dos pratos + lógica do AR e da medição
ferramentas/escalar_glb.py    corrige a escala de um .glb
assets/models/                modelos 3D
```

Os modelos atuais são exemplos públicos (Khronos / model-viewer) usados como
placeholder até existirem os pratos reais.
