# Projeto: Álbum de Figurinhas — Site de Lançamento Musical

## Visão Geral

Site de marketing para divulgar uma música nova, usando a mecânica de álbum de figurinhas da Copa do Mundo como engajamento e viral. Os usuários abrem pacotes diários, colecionam figurinhas, e **quem completar o álbum primeiro ganha R$500**. A campanha dura ~13–15 dias com o lançamento da música previsto para o dia 7.

> **O R$500 é o principal motor de conversão e retenção — deve aparecer com destaque em todas as telas relevantes do site:** página inicial, tela pós-demo, álbum do usuário ("faltam X figurinhas para concorrer a R$500"), ranking, e lembrete diário antes de abrir o pack.

**Desenvolvedor:** Davi (full-stack, vai construir o site do zero)  
**Audiência esperada:** ~100 pessoas (público pequeno, comunidade próxima)  
**Artistas envolvidos:** 6 artistas colaborando no projeto

---

## Estrutura do Álbum

### Total: 30 figurinhas (a definir em detalhes)

| # | Tipo | Quantidade |
|---|------|------------|
| 1 | Carta da Logo | 1 |
| 2 | Carta do Ícone da Música | 1 |
| 3–8 | Personagem de cada artista (1 por artista × 6) | 6 |
| 9–30 | (a definir — versões alternativas, bastidores, etc.) | 22 |

### Raridades

Cada uma das 30 posições do álbum pode ser preenchida por qualquer versão da figurinha — comum, prata ou dourada. **A dourada não é um slot extra**, é apenas a versão rara do mesmo slot. Quem tem a dourada do slot 7 completou o slot 7 com a versão premium.

- **Comum** — versão padrão, mais fácil de obter
- **Prata** — versão alternativa com efeito metálico/brilhante, mais rara
- **Dourada** — versão numerada (ex: `#3/15`), efeito holográfico, pode conter trecho exclusivo da música. Poucas cópias existem no sistema.

**Quantidades por raridade (fixas):**
- Dourada: **5 cópias** por carta (numeradas `1/5` a `5/5`)
- Prata: **10 cópias** por carta (numeradas `1/10` a `10/10`)
- Comum: sem limite de cópias

**Conteúdo exclusivo nas douradas:** cada carta dourada de artista contém um trecho de áudio da música do cantor daquela carta. Armazenado como arquivo de áudio no servidor, vinculado à `sticker_type` correspondente.

---

## Mecânicas Principais

### Pacotes diários
- Usuário abre **2 pacotes por dia** (cada pacote = 1 figurinha)
- Todos os 14 tipos disponíveis desde o **dia 1** (melhor para audiência pequena: gera variedade de conteúdo nas redes desde o início)
- A tensão diária vem da **raridade** do que você recebe, não do tipo

### Login e Anti-fraude
- **Login por e-mail** — simples, sem fricção. Cada conta abre apenas os packs que o sistema libera por dia, então o dano de múltiplas contas é limitado.
- Conta precisa ter **mínimo 7 dias de existência** para reivindicar o prêmio
- ~~CPF~~ — removido
- ~~Troca de figurinhas~~ — removida para simplificar o sistema

### Prêmio
- **R$500** para o **primeiro** a completar o álbum
- O pagamento é **manual** — o vencedor faz um post público (X/Instagram) provando que completou, Davi vê o post e entra em contato para combinar o pagamento
- Quando alguém completa o álbum, aparece o botão **"Reivindicar prêmio"** com instruções do post a fazer
- Apenas a primeira pessoa a completar vê esse botão — as demais veem o álbum concluído mas com aviso de que o prêmio já foi reivindicado

### Anúncio épico de vencedor
- Quando o primeiro usuário completar, o **site inteiro entra em modo de celebração**
- Banner fixo e destacado em todas as páginas: *"🏆 @username completou o álbum em X dias!"*
- Confetti ou partículas ao visitar qualquer página após o evento
- Visitantes novos veem o anúncio antes de qualquer coisa — vira um evento de marketing
- O site **permanece aberto**: todos podem continuar coletando figurinhas e completando o álbum por diversão, mesmo sem o prêmio disponível

### Controle técnico do prêmio (race condition)
- Flag atômica no banco: `premio_reivindicado` (boolean) + `vencedor_id` + `data_vitoria`
- Quando alguém completa, o sistema executa `UPDATE campaign SET premio_reivindicado = true WHERE premio_reivindicado = false` — se afetar 1 linha, é o vencedor; se afetar 0, o prêmio já foi reivindicado
- Garante que mesmo se duas pessoas completarem ao mesmo tempo, apenas uma pode reivindicar

---

## Figurinhas Douradas — Distribuição

Como o lançamento da música é no **dia 7**, a distribuição recomendada é:

- **Dias 1–3:** Soltar a maioria das douradas logo no início para garantir compartilhamento imediato e criar FOMO
- **Dias 4–6:** Algumas douradas mais, mantendo expectativa antes do lançamento
- **Dia 7 (lançamento):** Pico — soltar as últimas douradas para coincidir com o lançamento da música
- **Dias 8–13:** Cartas comuns e prata apenas; as douradas já estão todas distribuídas

**Exemplo com 5 douradas por carta rara e 3 cartas raras = 15 douradas totais:**
- Dia 1: 4 douradas
- Dia 2: 3 douradas
- Dia 3: 2 douradas
- Dia 4: 2 douradas
- Dia 7: 4 douradas (pico de lançamento)

---

## Design das Cartas

As artes já estão finalizadas com três versões por artista (dourada, prata, comum). O layout tem: logo do artista no canto superior esquerdo, número no canto superior direito, foto centralizada, nome do artista e título na parte inferior, ícone de microfone e 3 estrelas.

### Numeração nas cartas
- **Comuns:** exibir `#07` (número da posição no álbum) no lugar onde atualmente está a data
- **Prata e Dourada:** exibir `1/5` indicando qual cópia é do total existente

### Nome do dono nas raras
- Testar durante o desenvolvimento se cabe o nome do usuário na arte sem quebrar o layout
- Opção sugerida: linha de texto pequena na **borda inferior**, abaixo das estrelas, com a cor do tema da raridade (dourado/prata), estilo `@username`
- Se ficar estranho visualmente, **remover da carta** e exibir o nome apenas na página de visualização (`seusite.com/carta/gold-001`) via Open Graph: *"Carta #1/5 — pertence a @username"*
- O `1/5` na arte já é suficiente para gerar o desejo de mostrar — o nome na página prova a posse quando alguém clica no link compartilhado

---

## Sistema de Identidade das Figurinhas

### Numeração e nome do dono nas cartas

**Cartas comuns:** exibir `#07` (número da posição no álbum) no espaço onde hoje está `06/06` na arte. Simples, estilo coleção.

**Cartas prata e dourada:** exibir `1/5` no mesmo espaço. Renderizado dinamicamente no momento em que a carta é atribuída ao usuário.

**Nome do dono:** testar durante o desenvolvimento se cabe na carta sem quebrar o design. Candidato a posição: rodapé fino abaixo das estrelas/ícone, em fonte pequena com cor do tema da raridade (dourado/prata). Se ficar estranho ou forçado, remover da arte e exibir apenas na página de visualização.

- Se o nome for na carta: renderizar server-side junto com o número (node-canvas ou Sharp)
- Se o nome for só na página: configurar `og:title` e `og:description` da URL da carta com `"Carta #1/5 — pertence a @username"` para o preview funcionar ao compartilhar no X/Instagram

**Decisão final** sobre nome na carta fica para o momento do desenvolvimento, avaliando visualmente com a arte real.

### Serial único por figurinha
Cada instância de figurinha recebida no sistema ganha um serial único, ex: `FIG-GOLD-007-JOAO`. Isso serve para:
- Provar autenticidade e posse
- Criar numeração do tipo `#4/5` visível na carta
- Gerar URL pública verificável: `seusite.com/verify/FIG-GOLD-007`

### Compartilhamento
- Cada figurinha gera um **PNG para download** com serial e nome do dono embutidos
- A URL da figurinha tem **Open Graph tags** configuradas para renderizar o card como imagem no Twitter/Instagram quando compartilhada
- **Sem blockchain/NFT** — o serial único + página de verificação dá a mesma sensação de exclusividade sem fricção

### Cooldown de compartilhamento
- Figurinha só pode ser compartilhada após **1 dia** da data de recebimento
- Evita spam e dá um caráter mais orgânico ao compartilhamento

### Missões diárias — packs bônus
Além dos packs base, o usuário pode ganhar até **+2 packs por dia** completando missões:

| Missão | Bônus | Validação |
|--------|-------|-----------|
| Compartilhar o link do álbum | +1 pack | Cada usuário tem um link único do álbum (`seusite.com/album/username`); o site rastreia cliques de saída via UTM |
| Postar sobre a música com a hashtag | +1 pack | Usuário cola a URL do post; servidor verifica se contém o domínio do site ou a hashtag definida |

- Limite de 1 pack bônus por missão por dia, por conta
- A figurinha compartilhada precisa ter pelo menos 1 dia para poder ser usada na missão de compartilhamento
- ~~Convite de amigos~~ — removido para evitar abuso

---

## Conteúdo Exclusivo nas Douradas

Cartas douradas específicas contêm **trechos de 15–20 segundos da música** que ainda não foram lançados publicamente. Isso cria:
- Motivo genuíno para compartilhar (não é "tenho uma figurinha bonita" mas "ouvi algo que você ainda não ouviu")
- FOMO para quem ainda não tem
- A carta dourada como artefato de conteúdo exclusivo, não apenas visual

---

## QR Codes em Lives

Mecânica inspirada no podcast igor3k: durante lives/transmissões, exibir um **QR code na tela por 60 segundos**. Quem escanear ganha uma figurinha prata garantida. Objetivos:
- Cria incentivo real para assistir lives até o fim
- Distribui raridade de forma controlada (você decide quando aparece)
- Gera pico de engajamento em momentos específicos

---

## Páginas e Features do Site

### Álbum do usuário
- Grade com as **30 posições** do álbum
- Posições preenchidas mostram a figurinha com visual de acordo com a raridade (comum, prata, dourada)
- Posições vazias mostram silhueta/sombra da carta
- Contador visível: "X / 30 figurinhas"
- Ao clicar numa carta preenchida, abre o visualizador 3D com rotação
- Ao clicar numa posição vazia, mostra informação básica sobre aquela figurinha ("ainda não encontrada")

### Ranking
- Lista de usuários ordenada por número de figurinhas coletadas
- Mostra: posição, nome/username, quantidade de figurinhas, barra de progresso visual
- Atualização em tempo real ou próximo disso
- Cria senso de competição e urgência para quem está perto de completar
- Exibe o prêmio de R$500 em destaque no topo do ranking como lembrete constante

### Fluxo de cadastro — "demo pack"
- Visitante não logado pode abrir **1 pack gratuito** para experimentar a animação
- Após abrir, as cartas aparecem mas não são salvas — uma tela pede cadastro: *"Suas figurinhas estão esperando — crie uma conta para salvar e concorrer a R$500"*
- As cartas do demo ficam em `localStorage` (ou sessão anônima no backend) até o cadastro ser concluído
- Ao criar conta, as cartas do demo são transferidas automaticamente para o álbum
- O pack demo **conta como o pack do dia 1** — evita abrir infinitos packs deletando cookies
- Pack demo só dá cartas **comuns** — douradas e pratas não aparecem no demo para preservar a escassez
- Ranking é **público** — qualquer visitante (mesmo sem conta) pode ver quem está perto de completar

### Dashboard diário
- Mostra os packs disponíveis para abrir hoje (base + missões concluídas)
- Lista as missões do dia com status (feita / pendente)
- Botão de abrir pack com animação 3D

---

## Experiência Visual (Protótipo feito)

Arquivo: `figurinhas-3d.html`

### Fluxo
1. **Tela do pacote** — pacote animado com gradiente pulsante, clica para abrir
2. **Animação de abertura** — pacote rasga nos dois lados + flash de luz
3. **Revelação das cartas** — duas cartas flipam em sequência revelando raridade
4. **Visualizador 3D** — Three.js com drag para rotacionar, efeito holográfico nas douradas

### Stack técnica do protótipo
- **Three.js r128** — renderização 3D da carta, shader holográfico customizado
- **GLSL shader** — efeito arco-íris (fresnel + rainbow hue) que reage ao ângulo de visão, sparkles, brilho especular
- **Canvas 2D** — geração procedural da textura da carta (trocar por `drawImage()` com arte real)
- **CSS animations** — animação do pacote abrindo, flip das cartas
- Sem dependências além do Three.js

### Para adaptar o protótipo
- `CARDS[]` no início do JS: trocar `name`, `track`, `number`, `snippet`, cores
- `holoStrength`: `0.0` = comum, `~0.35` = prata, `~0.75` = dourada
- `drawCard()`: substituir por `drawImage()` quando tiver as artes reais
- Numeração `#X/Y` já prevista no design da carta

---

## Banco de Dados (estrutura a definir)

Entidades principais a modelar:
- `users` — id, email, senha_hash, data_cadastro, album_completo
- `sticker_types` — id, nome, raridade, max_copies, audio_snippet_url
- `sticker_instances` — serial, sticker_type_id, owner_id, data_recebida, data_pode_compartilhar
- `daily_packs` — user_id, data, pack_1_sticker_id, pack_2_sticker_id
- `share_log` — instance_id, user_id, data_compartilhamento, plataforma

---

## Decisões Pendentes

- [ ] Definir as 22 figurinhas restantes além de logo + ícone + 6 personagens (total: 30)
- [ ] Definir quais cartas terão versão dourada e quantas cópias cada
- [ ] Definir qual trecho de música vai em qual carta dourada
- [ ] Definir se prêmio é "primeiro a completar" ou sorteio ponderado
- [ ] Definir cronograma exato de drops das douradas (dia 1 = mais pesado)
- [ ] Escolher stack do backend (auth, banco, geração de PNG, og-image)

---

## Segurança e Qualidade de Código

### Princípios gerais
- **Nunca confiar no cliente** — toda ação importante (abrir pack, completar álbum, reivindicar prêmio, validar missão) deve ser processada e verificada **exclusivamente no servidor**. O frontend só exibe o resultado.
- **Toda lógica de negócio fica no backend** — o frontend nunca decide quantos packs o usuário tem, quais figurinhas ele recebeu, ou se o álbum está completo.

### Proteções contra fraude/hacking

| Risco | Proteção |
|-------|----------|
| Usuário chamar a rota de abrir pack mais vezes do que deveria | Verificar no banco, antes de gerar o pack, quantos packs o usuário já abriu hoje — bloquear se já atingiu o limite |
| Usuário forjar uma requisição de "missão concluída" | Validar a missão no servidor (checar URL do post, rastrear clique UTM) — nunca aceitar apenas `{ missao: "feita": true }` vindo do frontend |
| Usuário manipular o próprio álbum via requisição direta | A lista de figurinhas do usuário só pode ser alterada pelo sistema ao distribuir packs — nunca por uma rota direta do usuário |
| Falso positivo de álbum completo | Ao detectar conclusão, o servidor **revalida do zero**: busca todas as 30 posições do álbum do usuário no banco e confirma que cada uma tem pelo menos 1 figurinha antes de setar `album_completo = true` |
| Race condition no prêmio (dois vencedores simultâneos) | Operação atômica no banco (UPDATE com WHERE + checar linhas afetadas), nunca dois SELECTs separados |
| Abuso de rate limit | Limitar requisições por IP e por usuário nas rotas críticas (abrir pack, reivindicar missão, reivindicar prêmio) |

### Verificações que devem existir no código
- Ao abrir pack: `packs_disponiveis_hoje > 0` antes de gerar figurinha
- Ao completar missão: verificação real da missão + `missao_feita_hoje = false` antes de creditar
- Ao completar álbum: recontagem de todas as figurinhas do usuário no banco (não confiar em contador cached)
- Ao reivindicar prêmio: verificar `album_completo = true` no banco + operação atômica da flag de vencedor
- Logs de todas as ações críticas (quem abriu pack, quando, qual figurinha foi gerada) para auditoria manual se necessário

### Organização do código
- Separar claramente as camadas: rotas (controllers), lógica de negócio (services), acesso ao banco (repositories)
- Nenhuma query SQL/ORM diretamente nas rotas — sempre via service ou repository
- Variáveis de ambiente para todas as configurações sensíveis (chaves, strings de conexão)
- Comentários em funções críticas explicando *por que* a lógica existe, não só o que ela faz

---

## Linha do Tempo

| Dia | Evento |
|-----|--------|
| 1 | Site abre, todos os 14 tipos disponíveis, primeiras douradas dropam |
| 2–6 | Drops diários de pacotes, algumas douradas |
| 7 | **Lançamento da música**, pico de drops dourados |
| 8–13 | Corrida final para completar o álbum |
| 13–15 | Álbum fecha, apuração do prêmio |
