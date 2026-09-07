# Cardápio 3D

Cardápio web onde o cliente toca num prato, abre a câmera e vê a comida
**em tamanho real na mesa ou na mão dele**. Sem instalar app.

## Como funciona

Um botão só, e ele descobre sozinho onde pôr o prato. Nada de AR nativo:
Quick Look e Scene Viewer só ancoram em plano, nunca pousam nada na mão, e
ter os dois obrigaria o cliente a escolher o modo antes de apontar a câmera.

Então a câmera é lida direto pelo site (`getUserMedia`), a mão vem do
MediaPipe e a mesa vem do giroscópio, tudo desenhado com three.js por cima
do vídeo. O `<model-viewer>` ficou só como visualizador 3D da ficha, para
girar o prato com o dedo antes de abrir a câmera.

O tamanho real não vem do arquivo: vem do campo `larguraCm` de cada prato.
Um `.glb` exportado em qualquer escala aparece do tamanho certo.

## Rodando

```bash
python -m http.server 5173
```

Abra <http://localhost:5173>.

**No computador só dá para girar o modelo.** A câmera exige HTTPS e o
giroscópio exige celular, então o teste de verdade é sempre pelo aparelho.
`?debug=1` mostra o que o aparelho liberou.

## No ar

<https://lucasstabeli.github.io/cardapio-3d/>

Publicado no GitHub Pages a partir da branch `main`. Todo push republica
sozinho, em cerca de um minuto. HTTPS é obrigatório e o próprio Pages força.

## Um botão só: a câmera decide

**Ver em tamanho real** (`mao.js`) abre a câmera do próprio site e olha o que
está na frente dela a cada quadro. Havendo uma mão, o prato pousa na palma;
não havendo, ele desce para a superfície apontada. A troca é contínua —
ninguém escolhe o modo.

- **Mão** — pontos da mão pelo MediaPipe. A orientação vem da normal da palma,
  sempre virada para a câmera, então o prato não capota quando a mão gira nem
  troca de lado entre a esquerda e a direita. A distância é medida: o tamanho
  da mão em pixels contra o tamanho dela em metros diz a que profundidade ela
  está, e o prato entra na cena em escala 1.
- **Mesa** — o centro da câmera é a sonda. Enquanto não houver superfície,
  aparece só uma mira e nenhum prato. A gravidade lida no giroscópio diz
  quando o eixo da câmera está mesmo olhando para baixo; aí o prato pousa
  ali sozinho, sem botão. O ponto fica fixo no mundo, não na tela: girando o
  aparelho o prato fica onde foi posto. Sem giroscópio ele aparece à frente e
  a barra avisa. Não há rastreio de translação — andando, o prato acompanha.

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

Na mão o tamanho acompanha a mão, e isso está certo: a mão é a régua, e o
prato cresce com ela exatamente como um prato de verdade cresceria.

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
