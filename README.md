# Tijolo Clicker

Jogo *clicker/idle* de navegador com temática de engenharia civil, em pixel art.
Clique para assentar tijolos, erga prédios andar por andar, monte sua equipe e entregue obras cada vez maiores.

## Como jogar
- **Clique na obra** (ou aperte espaço) para assentar tijolos. Clicar rápido faz **combo**, que multiplica os tijolos por clique até ×2,5.
- **Tijolo de ouro:** às vezes um tijolo brilha na parede. Clique nele antes que suma para ganhar tijolos, dinheiro ou cliques ×10.
- Cada pavimento concluído paga um valor e passa a render **aluguel** por segundo.
- **Loja:**
  - **Melhorias** (aba própria, com contador de quantas dá para comprar): dobram a produção de um tipo de trabalhador ou máquina, dobram o clique, fazem o clique ganhar parte dos tijolos/s ou aumentam o aluguel. Aparecem conforme você avança.
  - **Equipe e máquinas** (12 níveis): Servente, Pedreiro, Betoneira, Mestre de obras, Caminhão de tijolos, Guindaste de torre, Engenheira civil, Bomba de concreto, Impressora 3D de concreto, Robô pedreiro, Fábrica de pré-moldados e Consórcio de construtoras. Compre de 1 em 1, de 10 em 10 ou de 100 em 100.
  - **Acabamentos:** janela, sacada, floreira e ar-condicionado. Aumentam o aluguel e aparecem desenhados no prédio.
  - **Segurança:** lona, kit de EPI e laudo do engenheiro protegem contra os imprevistos.
- **Obras:** Casa → Sobrado → Edifício residencial → Edifício comercial → Hotel → Arranha-céu → Torre recorde.
  Ao terminar uma obra, **entregue-a** para ganhar estrelas de **Reputação** (+5% em tudo, para sempre) e começar a próxima.
  **Equipe fiel:** 1 de cada tipo de operário ou máquina que você tinha vai junto para a próxima obra.
- **Benefícios da obra:** em alguns andares você escolhe 1 entre 3 cartas (ex.: cliques ×3, aluguel ×2, obra blindada, laje rápida). Cada obra fica diferente.
- **Tutorial** passo a passo depois do 1º pavimento (dá para rever na aba Obra).
  A Torre recorde fica 5 andares mais alta a cada entrega.
- **Imprevistos** (a partir do 1º pavimento):
  - **Entrega de material:** clique no palete para ganhar tijolos, dinheiro, cliques ×7 ou equipe ×4.
  - **Chuva:** equipe −50% por 30s (a lona evita).
  - **Rachadura:** aluguel −30% até você clicar nela para consertar (o laudo evita).
  - **Fiscal da prefeitura:** multa sem EPI, bônus com EPI.
  - **Propostas:** mudança de planta, material barato, hora extra e festa da laje.
- **Conquistas** (52): cada uma dá +1% em tudo.
- O jogo salva sozinho no navegador e continua rendendo enquanto você está fora (até 8h).

## Visual
Tudo é desenhado por código em pixel art (tela de 320×384):
- cada obra tem seu estilo de fachada e telhado;
- cada andar sorteia cor, tipo de janela, toldos e decorações (trepadeira, gato na janela, varal, grafite, placas…);
- as janelas compradas aparecem no prédio, e as que faltam ficam tapadas com tábua, lona ou tijolo;
- as máquinas compradas aparecem no cenário (betoneira, caminhão, guindaste de torre, impressora 3D, robôs, fábrica, dirigível);
- ciclo de dia e noite com luzes acesas, carros na rua, pássaros, avião e um mar de nuvens por volta do 28º andar.

## Rodar localmente
Abra o `index.html` no navegador. Não precisa instalar nada.

## Publicar (GitHub Pages)
Settings → Pages → *Deploy from a branch* → `main` / `(root)`.

## Estrutura
- `index.html`: página do jogo
- `style.css`: visual da interface
- `js/data.js`: itens, obras, conquistas e fórmulas da economia (também roda no Node, para simulações)
- `js/art.js`: ícones 16×16 e fonte de pixels
- `js/world.js`: cenário, prédio e efeitos
- `js/game.js`: lógica, imprevistos, loja, abas e salvamento

## Versões
- **v0.1:** tijolos, pavimentos, aluguel, 3 trabalhadores, janela e porta, salvamento e progresso offline.
- **v0.2:** imprevistos da obra e itens de segurança.
- **v1.0:** 12 tipos de equipe e máquina, 88 melhorias, acabamentos, 7 obras com Reputação, 48 conquistas, abas de Conquistas e Obra, visual novo com mais pixels e andares variados.
- **v1.1 (atual):** números voando suaves, jogo mais leve, aba de Melhorias separada, tutorial, equipe fiel, combo de cliques, tijolo de ouro e benefícios da obra.
