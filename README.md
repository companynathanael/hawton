# Hawton Arcade

Jogo de exploração em pixel art (vista de cima), clima de terror de fliperama abandonado.
Por enquanto: tela inicial → cutscene da fachada → exploração do mapa com o puzzle da energia. Sem história e sem animatrônicos.

## Mapa

O mapa jogável é feito em tiles (8px) e desenhado em pixel art pelo próprio código (`src/world.js`). Ele segue o layout da planta original, com paredes de verdade calculadas a partir das salas, portas, fliperamas e mobília com colisão.

O mapa das câmeras e o mapa da tecla M (ou botão MAP) são esquemáticos, gerados a partir do mesmo layout: cada sala é uma caixa, os corredores são linhas e as saídas trancadas aparecem em vermelho. A planta original fica em `assets/map.jpg` só como referência.

- **Portas:** E abre e fecha. Porta fechada bloqueia a passagem e a luz da lanterna. As passagens com neon ficam sempre abertas. As portas que dão para fora estão trancadas.
- **Fliperamas:** mais de 80 máquinas com telas animadas quando há energia. E em frente a uma delas abre um puzzle (só por diversão, não dá recompensa): **Apague as Luzes**, **Deslize 8**, **Memória**, **Torre** (Hanói com 4 discos) e **Sequência** (repita 6 rodadas). Setas movem o cursor, E joga, Esc sai, e também dá para clicar ou tocar.

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
