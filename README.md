# Tijolo Clicker

Jogo *clicker/idle* de navegador com temática de engenharia civil, em pixel art.
Clique para assentar tijolos, feche pavimentos, receba aluguel e monte sua equipe de obra.

## Como jogar
- **Clique na obra** (ou aperte espaço) para assentar tijolos.
- Cada pavimento concluído paga um valor e passa a render **aluguel** por segundo.
- Na loja:
  - **Ferramentas:** mais tijolos por clique.
  - **Equipe:** servente, pedreiro e mestre de obras constroem sozinhos.
  - **Peças:** janelas e portas aumentam o aluguel e aparecem no prédio.
  - **Segurança:** lona, kit de EPI e laudo do engenheiro protegem contra os imprevistos.
- **Imprevistos da obra** (a partir do 1º pavimento):
  - **Guindaste com material:** clique no palete para ganhar tijolos, dinheiro ou cliques ×7.
  - **Chuva:** a equipe rende metade por 30s (a lona evita).
  - **Rachadura:** aluguel −30% até você clicar nela algumas vezes para consertar (o laudo evita).
  - **Fiscal da prefeitura:** multa se a equipe estiver sem EPI, bônus se estiver com EPI.
  - **Escolhas:** mudança de planta, material barato e hora extra. Aceite ou recuse em até 20s.
- O jogo salva sozinho no navegador e continua rendendo enquanto você está fora (até 8h).

## Rodar localmente
Abra o `index.html` no navegador. Não precisa instalar nada.

## Publicar (GitHub Pages)
Settings → Pages → *Deploy from a branch* → `main` / `(root)`.

## Estrutura
- `index.html`: página do jogo
- `style.css`: visual da interface
- `js/game.js`: lógica, economia e toda a pixel art (desenhada pelo código)

## Roteiro
- **v0.1:** tijolos, pavimentos, dinheiro, aluguel, 3 trabalhadores, janela e porta, salvamento automático e progresso offline, ciclo de dia e noite.
- **v0.2 (atual):** imprevistos da obra (guindaste, chuva, rachadura, fiscal, eventos de escolha) e itens de segurança (lona, EPI, laudo).
- **v0.3:** novos projetos (sobrado, prédio, arranha-céu), prestígio (Reputação) e conquistas.
- **v1.0:** arte final, sons e lançamento no itch.io.
