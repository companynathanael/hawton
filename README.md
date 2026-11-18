# Hawton Arcade

Jogo de exploração em pixel art (vista de cima), clima de terror de fliperama abandonado.
Por enquanto: tela inicial → cutscene da fachada → exploração do mapa com o puzzle da energia. Sem história e sem animatrônicos.

## Câmeras em 3D

As câmeras de segurança montam a sala de cada câmera em 3D (`src/cam3d.js`, com three.js em `src/vendor/`): chão e paredes com a arte do mapa, teto com fluorescentes, portas que abrem e fecham de verdade, fliperamas vistos de frente com a tela acesa e os outros móveis como blocos sólidos. As luzes seguem os circuitos de energia do jogo. Se o 3D não carregar, as câmeras voltam a ser 2D.

## Visão por sala (opcional)

Ligada só com `window.HAWTON_VISION = true` ou `?vis` na URL. Só o cômodo onde o jogador está aparece; tudo fora das paredes dele fica preto (as câmeras continuam mostrando qualquer sala). A câmera segue o jogador sem parar na borda do mapa, então corredores ficam centralizados na tela. A troca de sala tem um fade rápido.

## Sustos

Enquanto a energia não volta, coisas acontecem a cada 14–26 segundos (o primeiro uns 15 s depois do início): tijolos e pedaços do teto despencam na frente do jogador e ficam no chão, uma lâmpada fluorescente cai e estoura com faíscas, uma porta aberta bate sozinha, um fliperama liga sozinho com som distorcido, a lanterna morre por alguns segundos, e o prédio treme soltando poeira. Quando a energia é ligada, os sustos param.

## Mapa

O mapa jogável é feito em tiles (8px) e desenhado em pixel art pelo próprio código (`src/world.js`). Ele segue o layout da planta original, com paredes de verdade calculadas a partir das salas, portas, fliperamas e mobília com colisão.

O mapa das câmeras e o mapa da tecla M (ou botão MAP) são esquemáticos, gerados a partir do mesmo layout: cada sala é uma caixa, os corredores são linhas e as saídas trancadas aparecem em vermelho. A planta original fica em `assets/map.jpg` só como referência.

- **Portas:** E abre e fecha. Porta fechada bloqueia a passagem e a luz da lanterna. As passagens com neon ficam sempre abertas. As portas que dão para fora estão trancadas.
- **Fliperamas:** mais de 80 máquinas com telas animadas quando há energia. E em frente a uma delas abre um puzzle (só por diversão, não dá recompensa): **Apague as Luzes** (7x7), **Deslize 15** (4x4), **Memória** (36 cartas), **Torre** (Hanói com 6 discos, mínimo de 63 jogadas) e **Sequência** (30 rodadas, cada vez mais rápida). Setas movem o cursor, E joga, Esc sai, e também dá para clicar ou tocar.

## Sala de segurança

Sente na mesa (E). Sentado:

| Tecla | Ação |
|---|---|
| A / D | fechar ou abrir a porta oeste / leste (portas de aço) |
| Q / E | acender a luz do corredor oeste / leste |
| S | câmeras |
| Esc | levantar |

Nas câmeras: 1–9 ou setas trocam a câmera, e dá para clicar nos números da planta. Esc sai.

Tudo isso só funciona com energia, e cada coisa ligada gasta mais (barrinhas de uso). Se a energia chegar a 0%, o prédio apaga, as portas de aço abrem e é preciso religar o gerador e o painel.

## Puzzle da energia

O prédio começa sem energia, só com luzes de emergência e a lanterna.

1. **Gerador (Power RM 2):** aperte E (ou clique) quando o ponteiro estiver na zona verde. São 3 acertos; cada erro tira um. A zona fica menor e o ponteiro mais rápido a cada acerto.
2. **Painel de distribuição (Power RM 1):** gire as peças de fio até a energia do gerador chegar às 3 saídas (Arcades, Cozinha, Salões). O tabuleiro é gerado aleatoriamente a cada vez.

Com o painel resolvido, as luzes acendem em onda a partir da sala de força, os fliperamas voltam a tocar e as quedas de energia passam a acontecer. Sem o gerador, as luzes das salas de força ficam apagadas.

## Como rodar

Precisa de um servidor local (abrir o `index.html` direto pelo `file://` bloqueia o efeito CRT em WebGL):

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000

## Controles

| Tecla | Ação |
|---|---|
| WASD / setas | andar |
| Shift | correr |
| Mouse | apontar a lanterna |
| F | liga/desliga lanterna |
| E | abrir/fechar porta, interagir, girar peça, puxar o gerador |
| Esc | fechar painel |
| M ou Tab | mapa |
| Enter / Esc | pular a cutscene |
| K | mostrar colisão (depuração) |

No celular aparecem um analógico e botões na tela.

Atalhos de teste: `?play` vai direto pro jogo, `?cut` vai direto pra cutscene, `?play&lit` começa com a energia ligada.

## Efeitos

- Pós-processamento em WebGL: tela CRT curva, aberração cromática, bloom, scanlines, granulado, faixa de interferência e glitch.
- Iluminação dinâmica: mapa de luz com neons e fluorescentes que piscam, quedas de energia aleatórias, lanterna com sombra (raycast nas paredes) e poeira suspensa no feixe.
- Cutscene: chuva com respingos, neblina, relâmpago, letreiro que acende e zumbe, postes falhando e câmera entrando pela porta.
- Áudio 100% sintetizado (WebAudio): chuva, vento, trovão, zumbido elétrico, drone ambiente, rangidos, passos por tipo de piso (carpete, azulejo, madeira, metal) e bipes de fliperama ao longe.
- Segredos: passagem escondida na Power RM 2 e uma rachadura no porão que levam ao porão secreto.

## Estrutura

- `index.html` — página e controles de toque
- `src/game.js` — tela inicial, cutscene, jogador, câmera, luz, HUD
- `src/world.js` — mapa em tiles: salas, paredes, portas, mobília, luzes, câmeras e colisão
- `src/post.js` — shader CRT
- `src/audio.js` — sons sintetizados
- `src/sprite.js` — sprite do jogador desenhado em código
- `assets/map.jpg` — planta original (referência do layout)
- `assets/facade.jpg` — fachada da cutscene

Para mudar o mapa, edite as listas `ROOMS`, `DOORS` e a mobília em `src/world.js`; a tecla **K** mostra a colisão no jogo.
