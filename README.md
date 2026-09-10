# Cardápio 3D

Cardápio web onde o cliente toca num prato, abre a câmera e vê a comida
**em tamanho real na mesa dele**. Sem instalar app.

## Como funciona

Um botão só para o cliente — "Ver em tamanho real" — e dois caminhos por
baixo dele.

**1. AR nativo (preferido).** Quick Look no iPhone, Scene Viewer no Android,
pelo `<model-viewer>`. É o único que enxerga a mesa de verdade: quem acha o
plano e ancora o prato é o ARKit ou o ARCore. O prato fica no lugar quando
o cliente anda em volta, e ganha sombra de contato e a luz do ambiente. O
USDZ do iPhone o próprio model-viewer gera do `.glb` — não há arquivo extra
no repositório.

**2. Câmera própria (reserva).** Só entra onde não existe AR nativo. A
câmera é lida direto pelo site (`getUserMedia`), a superfície é adivinhada
pelo giroscópio e o desenho é three.js por cima do vídeo. Não há rastreio de
translação: girando o celular funciona, andando o prato acompanha. Serve
para dar a ideia do tamanho, não para enganar o olho.

O AR nativo já tinha sido removido uma vez (`677864e`), e o motivo era o
modo "na minha mão": Quick Look e Scene Viewer pedem um plano e ficam
mandando mover o aparelho quando você aponta para a palma. O modo mão saiu
em 10/09/2026 e levou o motivo junto — apontar para a mesa é exatamente o
caso para o qual o AR nativo foi feito.

Na câmera própria o tamanho vem do campo `larguraCm` de cada prato, então um
`.glb` fora de escala ainda aparece certo. **No AR nativo não**: o USDZ sai
do arquivo, e o `ar-scale="fixed"` impede o cliente de esticar o prato. Ou
seja, o `.glb` precisa estar na escala real — 1 unidade = 1 metro. Os três
atuais estão; para corrigir um novo, use `ferramentas/escalar_glb.py`, que
grava a escala nos vértices (nó pai com `scale` se perde na conversão para
USDZ).

## Rodando

```bash
python -m http.server 5173
```

Abra <http://localhost:5173>.

**No computador só dá para girar o modelo.** O AR nativo exige celular, e a
câmera própria exige HTTPS mais giroscópio — o teste de verdade é sempre
pelo aparelho. `?debug=1` mostra por qual caminho o prato vai aparecer:
`ar nativo: sim` é o bom.

## No ar

<https://lucasstabeli.github.io/cardapio-3d/>

Publicado no GitHub Pages a partir da branch `main`. Todo push republica
sozinho, em cerca de um minuto. HTTPS é obrigatório e o próprio Pages força.

## Um botão só: a câmera pousa o prato

**Ver em tamanho real** (`camera.js`) abre a câmera do próprio site. O centro
da câmera é a sonda: enquanto não houver superfície aparece só uma mira e
nenhum prato. A gravidade lida no giroscópio diz quando o eixo da câmera está
mesmo olhando para baixo; aí o prato pousa ali sozinho, sem botão.

O ponto fica fixo no mundo, não na tela: girando o aparelho o prato fica onde
foi posto. Sem giroscópio ele aparece à frente e a barra avisa.

Dois limites que valem dizer na cara:

- **Não é detecção de plano de verdade.** Nenhum navegador de iPhone oferece
  isso numa página web. O que existe aqui é um palpite calibrado pela
  gravidade — celular inclinado para baixo além de ~16°, a 35 cm de altura.
- **Não há rastreio de translação.** Girar o aparelho no lugar funciona;
  andando em volta, o prato acompanha em vez de ficar parado na mesa.

O modo **"na minha mão"** (MediaPipe, palma como âncora) existiu até
10/09/2026 e foi removido a pedido do cliente. Está no histórico do git.

## O tamanho não pode mudar

O ponto do cardápio é o cliente saber de que tamanho é a comida, então o
prato não pode crescer nem encolher enquanto ele mexe o celular.

Dois cuidados garantem isso:

1. **A largura real vem do `larguraCm`**, nunca do arquivo. Um `.glb`
   exportado em qualquer escala aparece do tamanho certo.
2. **A distância até a mesa é medida uma vez e trava.** Antes ela era
   recalculada da inclinação a cada repouso, então bastava inclinar o
   celular para o prato mudar de tamanho. Agora, uma vez pousado, só a
   direção muda: o prato passeia pelo quadro sem mudar de tamanho. Medido
   com giroscópio simulado — de 25° para 45° de inclinação, a largura
   desenhada ficou em 708 px nos dois.

A distância travada é a maior entre duas: a que a gravidade indica e a que
faz o prato caber inteiro no quadro. Sem isso um peixe de 45 cm visto a 35 cm
transbordaria a tela e não daria para julgar nada.


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
  larguraCm: 28,        // largura real, medida com régua
}
```

## Arquivos

```
index.html                    estrutura da página e do visor 3D
styles.css                    visual
app.js                        dados dos pratos + tela da ficha e da medição
camera.js                     câmera em tamanho real (three.js + giroscópio)
ferramentas/escalar_glb.py    corrige a escala de um .glb
assets/models/                modelos 3D
```

Os modelos atuais são exemplos públicos (Khronos / model-viewer) usados como
placeholder até existirem os pratos reais.
