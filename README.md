# Hawton Arcade

Jogo de exploração em pixel art (vista de cima), clima de terror de fliperama abandonado.
Por enquanto: tela inicial → cutscene da fachada → exploração livre do mapa. Sem história e sem animatrônicos.

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
| E | interagir |
| M ou Tab | mapa |
| Enter / Esc | pular a cutscene |
| K | mostrar colisão (depuração) |

No celular aparecem um analógico e botões na tela.

Atalhos de teste: `?play` vai direto pro jogo, `?cut` vai direto pra cutscene.

## Efeitos

- Pós-processamento em WebGL: tela CRT curva, aberração cromática, bloom, scanlines, granulado, faixa de interferência e glitch.
- Iluminação dinâmica: mapa de luz com neons e fluorescentes que piscam, quedas de energia aleatórias, lanterna com sombra (raycast nas paredes) e poeira suspensa no feixe.
- Cutscene: chuva com respingos, neblina, relâmpago, letreiro que acende e zumbe, postes falhando e câmera entrando pela porta.
- Áudio 100% sintetizado (WebAudio): chuva, vento, trovão, zumbido elétrico, drone ambiente, rangidos, passos por tipo de piso (carpete, azulejo, madeira, metal) e bipes de fliperama ao longe.
- Segredos: passagem escondida na Power RM 2 e uma rachadura no porão que levam ao porão secreto.

## Estrutura

- `index.html` — página e controles de toque
- `src/game.js` — tela inicial, cutscene, jogador, câmera, luz, HUD
- `src/mapdata.js` — colisão (`walk`/`block`), salas, luzes e pontos de interação, em pixels da planta
- `src/post.js` — shader CRT
- `src/audio.js` — sons sintetizados
- `src/sprite.js` — sprite do jogador desenhado em código
- `assets/map.jpg` — planta original (usada no mapa da tecla M)
- `assets/map_clean.png` — planta sem os rótulos (usada no jogo), gerada por `tools/clean_map.py`
- `assets/facade.jpg` — fachada da cutscene

Para ajustar colisão, edite os retângulos em `src/mapdata.js` e aperte **K** no jogo para conferir.
