# Lacunas.obra

Plataforma local de **inteligência de projetos**: transforma pranchas em lacunas estruturadas, organiza as decisões pendentes, rastreia respostas e evidências, mostra riscos financeiros e gera uma EAP de orçamento.

A interpretação das pranchas é feita pelo **Claude Code**. O app é a interface estruturada entre o profissional, os responsáveis pelo projeto e o agente de IA. Nada é inventado: só entra o que está nas pranchas ou nas respostas, sempre com origem, status e histórico.

## Versão publicada (GitHub Pages)

`npm run site` gera `docs/`: o app completo rodando **no navegador**, sem servidor.
- **Projeto de demonstração**: as pranchas (imagens) e as 16 lacunas do LOFT. O PDF original não é publicado.
- **Importar o seu PDF**: em Projeto › Base de pranchas, o PDF é renderizado no navegador com PDF.js (cdnjs, versão fixa), e o texto é extraído com posição. Nada é enviado a servidor.
- **Lacunas**: no PDF importado, marque-as com a ferramenta **Nova lacuna** (tela Pranchas). A análise automática pelo Claude Code exige a versão local.
- **Armazenamento**: as respostas, medições, anotações, anexos e projetos importados ficam no **IndexedDB do seu navegador**. A lógica é a mesma do servidor (`lib/nucleo-store.js`), só muda o adaptador de armazenamento.
- **Só na versão local**: exportação XLSX, análise e processamento pelo Claude Code, e anexos acessíveis por outras pessoas.

Para publicar, ative em Settings › Pages: branch `main`, pasta `/docs` (ou `/`, que redireciona para `docs/`).

## Rodar

```bash
cd lacunas-app
npm start                  # http://localhost:8766
npm test                   # 83 testes (node:test), sem dependências
npm run validar            # integridade de projeto.json + lacunas.json
npm run processar          # prévia do processamento de respostas (não altera nada)
npm run processar:aplicar  # aplica (com backup) — usado pelo Claude Code
node scripts/novo-projeto.js <id> <arquivo.pdf> --nome="…" --revisao=R01 --obra=<obra> --escala=75
node scripts/extrair-texto.js <arquivo.pdf> [--projeto=<id>]
node scripts/migrar-projetos.js <id>   # dados/ de projeto único → dados/projetos/<id>/
```

O poppler (pdftoppm, pdftotext, pdfinfo) é localizado automaticamente no PATH, ignorando o pdftotext do xpdf. Também é possível definir `POPPLER_BIN`.

Requer Node 20+. **Sem dependências npm**: XLSX, ZIP, gráficos e relatórios foram implementados sem bibliotecas.

## Telas

| Tela | O que faz |
|---|---|
| **Visão geral** | Indicadores reais (total, abertas, pendentes, em validação, validadas, alta prioridade, conflitos), maturidade (% resolvido), alertas clicáveis, evolução diária, distribuição por categoria/prioridade/ambiente/disciplina, risco financeiro consolidado. Cada indicador leva à lista filtrada. |
| **Pranchas** | Visualizador em alta resolução (120 dpi): zoom ancorado no cursor e na pinça, arraste, ajustar, 100%, navegação entre pranchas e entre marcadores. Os marcadores ficam no mesmo plano da imagem e não saem do lugar com zoom ou arraste. O rótulo mantém tamanho constante na tela. Ferramentas de desenho, como no vídeo de referência: **Área** (polígono → quadro de ambientes), **Distância** (salva como cota), **Linha** e **Texto** (anotações na prancha), além de **Calibrar** escala por cota conhecida. Camadas: ambientes medidos e **texto do PDF** (posições exatas). Lista filtrada, sincronizada com os marcadores, e painel de detalhe redimensionável. |
| **Lacunas** | Busca, filtros (status, prioridade, categoria, disciplina, ambiente, prancha) persistentes, ordenação por criticidade, lista ou cartões, seleção múltipla e mudança de status em lote, com confirmação e validação individual. |
| **Quadro de ambientes** | Áreas e perímetros medidos sobre as pranchas, com a escala da prancha, ligados às lacunas pelo nome do ambiente. Na EAP, a área vira quantidade de piso e forro, e perímetro × altura vira quantidade de parede. Lista também os ambientes citados nas lacunas que ainda não foram medidos. |
| **Revisões** | Compara duas revisões (R00 × R01): lacunas resolvidas, novas e mantidas, mais a diferença visual das pranchas (modo diferença ou sobreposição). |
| **Compatibilização** | Matriz disciplina × situação, ocorrências multidisciplinares e entre pranchas, prévia do processamento de respostas e integridade dos dados. |
| **Orçamento / EAP** | Árvore Projeto › Disciplina › Ambiente › Grupo › Serviço. Permite escolher status e colunas e exportar em XLSX, CSV hierárquico ou CSV v0.1. Inclui tabela de riscos por lacuna. |
| **Relatórios** | 8 relatórios para imprimir ou salvar em PDF: executivo, abertas (com recorte da planta), por disciplina, inconsistências, respostas, riscos, evolução e especificações consolidadas. |
| **Projeto / Configurações** | Ficha técnica, lista de projetos e revisões (com troca do projeto ativo), **Base de pranchas** (importar PDF como novo projeto ou revisão), pranchas, seu nome (autor no histórico), tema claro/escuro/sistema e atalhos. |

### Detalhe da lacuna

O detalhe é organizado em seções recolhíveis:
1. **Entender**: o que falta, onde (com botões que levam a cada marcador, ✓ ancorado no texto do PDF ou ≈ estimado), a evidência extraída do PDF, os links "Ver também" para lacunas relacionadas, por que importa, o que responder e o que acontece se não for resolvida.
2. **Resposta**: campos, observação e responsável.
3. **Evidências**: documento, e-mail, reunião, prancha ou foto, com **anexo de arquivo** (PDF, imagem ou texto, até 10 MB). O tipo é validado pelo conteúdo, e o arquivo recebe hash SHA-256 e é servido em sandbox.
4. **Validação técnica**: nota de validação.
5. **Impacto financeiro**.
6. **Histórico**: cada alteração com o valor anterior, o novo valor, o momento, a origem (app ou Claude) e o autor.

Há indicador de alterações não salvas, confirmação antes de descartar e `Ctrl+S` para salvar.

### Atalhos

`M` área · `D` distância · `L` linha · `T` texto · `Enter` conclui · `Backspace` desfaz vértice · `J`/`K` próxima/anterior lacuna · `Shift+J`/`Shift+K` marcador · `[`/`]` prancha · `+`/`−` zoom · `F` ajustar · `0` 100% · `Ctrl+S` salvar · `/` buscar · `Esc` fechar · `g` seguido de `v`/`p`/`l`/`c`/`o`/`r` navega · `?` ajuda.

## Sugestões automáticas (regras fixas, sem IA)

O app sugere respostas para algumas lacunas com base em regras determinísticas (`lib/dominio/sugestoes.js`). Funciona igual na versão local e no GitHub Pages.

| Regra | Quando se aplica | Confiança |
|---|---|---|
| Numeração de folhas repetida | Lacuna de documentação sobre folhas, quando há números de folha duplicados nas pranchas | Alta |
| Consistência com outra lacuna | Outra lacuna do mesmo ambiente ou relacionada já respondeu o mesmo campo | Alta se validada; média se só respondida |
| Área molhada ou lavável | Banheiro, lavabo, copa, cozinha, amamentação, DML ou vestiário (halls e circulações ficam de fora): recomendação técnica genérica | Baixa (não é especificação) |
| Quantidade já levantada | O impacto financeiro da lacuna já tem quantidade com origem | Alta |

- A sugestão **não vira resposta sozinha**: o botão "Aplicar ao formulário" só preenche campos **vazios** e grava um rastro na observação. Você revisa e salva, e a resposta continua precisando de **validação técnica com evidência**.
- No LOFT, hoje recebem sugestão as lacunas L01, L02, L03, L10 e L13. A regra de consistência passa a cobrir mais lacunas à medida que elas são respondidas.
- Decisões que só o projetista pode tomar (cor do vinílico, modelo de luminária, modelo do condomínio) nunca recebem sugestão.

## Workflow de status

```
aberta ──► pendente (de terceiros) ──► respondida ──► em validação técnica ──► validada
   │            │                          │                  │                   │
   └──► não aplicável (exige motivo)       └──► reaberta ◄────┴───────────────────┘
```

- **Respondida ≠ validada.** Só a **validada** é informação técnica confirmada, e ela **exige nota de validação e pelo menos uma evidência**.
- Respostas validadas ou em validação ficam travadas. Para editar, é preciso reabrir a lacuna (o que fica registrado).
- O servidor recusa transições inválidas (por exemplo, aberta → validada) com 409.
- Cores: vermelho = aberta (a reaberta usa tracejado ou hachura); amarelo = pendente ou em validação; verde = respondida; verde-escuro com ✓ = validada; cinza = não aplicável. A cor nunca aparece sozinha: há sempre um rótulo junto.

## Protocolo Claude Code ⇄ app

1. **Importar.** Em Projeto › Base de pranchas, envie o PDF (ou peça ao Claude Code, que roda `scripts/novo-projeto.js`). As pranchas são renderizadas a 120 dpi e a camada de texto é extraída.
2. **Analisar.** Peça ao Claude Code `analise o projeto <id> e gere as lacunas`. Ele lê as pranchas (recortes em alta resolução), usa o `texto-pdf.json` para ancorar marcadores e como evidência objetiva (ex.: ausência de símbolo de acabamento), escreve `lacunas.json` e roda `npm run validar`.
3. **Responder.** No app, você responde, anexa evidências e clica em **Devolver para o Claude**.
4. **Processar.** Peça ao Claude Code `processe as respostas das lacunas`. O Claude então:
   1. roda `npm run processar` (prévia) e lê o relatório em `dados/processamentos/`;
   2. faz as checagens determinísticas: completude (campos vazios), respostas vagas ("a definir", "?"…) e contradições (mesmo campo, mesmo ambiente, valores diferentes);
   3. faz a revisão técnica e semântica das respostas e o impacto em outras lacunas;
   4. aplica com `npm run processar:aplicar`, que gera backup. Respostas completas vão para **em validação**; respostas incompletas são **reabertas** com o motivo. **Nunca valida automaticamente**;
   5. cria novas lacunas em `lacunas.json`, quando justificável, com IDs novos (os existentes nunca são reaproveitados);
   6. resume o processamento.
5. O app **detecta sozinho** as mudanças feitas fora dele: verifica a cada 5 s e quando a aba ganha foco, sem nunca descartar edições não salvas.

## Dados e rastreabilidade

```
dados/
  config.json         projeto ativo
  projetos/<id>/      um projeto ou uma revisão (ex.: loft-osasco-r00)
  …dentro de cada projeto:
  projeto.json        ficha técnica, pranchas, sistema de coordenadas de referência
  lacunas.json        definições (escritas pelo Claude) — L01…L16 preservadas
  respostas.json      respostas por lacuna (mapa id → resposta; compatível com a v0.1)
  historico.json      eventos: de/para, alterações campo a campo, origem, autor, motivo, revisão
  esquema.json        versão do esquema de dados (atual: 2)
  backups/            cópias automáticas antes de migrações e de cada processamento
  processamentos/     relatórios de cada processamento
  pranchas/           imagens das pranchas (servidas só via 127.0.0.1)
  texto-pdf.json      palavras do PDF com posição exata (pdftotext -bbox)
  ambientes.json      quadro de ambientes (polígonos medidos)
  anotacoes.json      anotações de texto, linha e cota
  anexos/             arquivos de evidência (<uuid>.<tipo>)
  fonte.pdf           PDF importado pela Base de pranchas
```

O modo legado (um `projeto.json` direto em `dados/`) continua funcionando.

- **Migração v1 → v2** automática, com backup prévio. Os campos novos (`ambientes`, `disciplinas`, `relacionadas`, `impactoFinanceiro`, `identificadaEm`, `origem`) são opcionais: lacunas no formato antigo continuam funcionando.
- **Concorrência**: as gravações são serializadas. Cada resposta tem `revisao`, e quem envia uma revisão desatualizada recebe 409. Duas abas não se sobrescrevem.
- **Gravação atômica** (arquivo temporário + rename) e **validação** de todo dado recebido: tamanho, tipos, números não negativos, evidências e UTF-8 estrito (bytes inválidos são recusados).
- **Segurança**: servidor só em `127.0.0.1`. A escrita exige `Content-Type: application/json`, Host e Origin locais (contra CSRF e DNS rebinding). Há proteção contra path traversal, limite de 64 KB por requisição, CSP restritiva e nenhum `innerHTML`.

### Formato de `lacunas.json` (v2)

```json
{
  "id": "L01", "titulo": "…", "categoria": "piso|parede|revestimento|forro|iluminacao|inconsistencia|documentacao",
  "prioridade": "alta|media|baixa", "onde": "…", "problema": "…", "pergunta": "…", "impacto": "…",
  "ambientes": ["Banheiros"], "disciplinas": ["arquitetura", "revestimentos"], "relacionadas": ["L09"],
  "identificadaEm": "2026-11-15", "origem": "Análise Claude Code …",
  "campos": [{ "chave": "piso", "rotulo": "Piso" }],
  "marcadores": [{ "prancha": 2, "x": 802, "y": 1066, "w": 65, "h": 29 }],
  "impactoFinanceiro": { "tipo": "nao_quantificado", "servico": "…", "unidade": "m²", "quantidade": null, "custoUnitario": null, "valorEstimado": null, "incerteza": "alta", "justificativa": "…" }
}
```

Os marcadores usam o sistema `referencia` do `projeto.json` (1873×1325), que é independente da resolução da imagem exibida.

## Impacto financeiro e EAP

- **Calculado** = quantidade × custo unitário, ambos informados. **Estimado** = valor global com justificativa obrigatória. Sem isso, a lacuna é **risco não quantificado**.
- Calculado e estimado **nunca são somados entre si**. Lacunas relacionadas que têm valor nas duas pontas são sinalizadas como possível sobreposição.
- A EAP só preenche quantidade e custo quando a lacuna gera **um único serviço**. Caso contrário, a coluna Observações explica por quê. Itens não validados saem marcados como tal.

## Organização do código

```
server.js               rotas HTTP
lib/http.js             respostas, estáticos seguros, corpo UTF-8, proteções, log JSON
lib/store.js            persistência, validação, transições, histórico, migração, backups
lib/dominio/            regras puras, compartilhadas com o navegador (/dominio/*.js)
  status.js · lacunas.js · impacto.js · indicadores.js · processamento.js · geometria.js · revisoes.js
lib/eap.js              CSV v0.1 (compatibilidade)
lib/eap-hierarquica.js  EAP em árvore + CSV
lib/xlsx.js             XLSX/ZIP sem dependências
lib/relatorios.js       8 relatórios HTML
lib/projetos.js         catálogo de projetos/revisões e projeto ativo
lib/importar-pdf.js     importação de PDF (poppler): pranchas + texto
lib/texto-pdf.js        leitura do pdftotext -bbox → coordenadas de referência
lib/anexos.js           anexos de evidência (tipo por conteúdo, SHA-256)
scripts/                validar · processar · novo-projeto · extrair-texto · migrar-projetos
public/                 app (módulos ES): shell, estado, visor, gráficos, vistas/*
test/                   56 testes: unidade, integração HTTP, exportações, segurança
```

## Limitações conhecidas

- **Texto do PDF parcial**: no PDF atual, nomes de ambientes, cotas e PD estão em fonte SHX do AutoCAD, que vira desenho vetorial. Só legendas, numeração de mobiliário e os 37 símbolos "A" saem como texto. Por isso, áreas são medidas na prancha, e não extraídas.
- **Escala declarada, não calibrada**: 1:75 lida nos títulos dos desenhos e conferida por plausibilidade. Calibre com uma cota real para medições de orçamento.
- **"Manual e convenções"** (visível na coluna do vídeo) não foi implementado: o conteúdo dele não é legível em nenhum frame.
- **PDF**: os relatórios são HTML formatado para impressão em A4. O PDF sai pelo "Salvar como PDF" do navegador; não há gerador de PDF no servidor.
- **Sem detecção geométrica de interferências**: a compatibilização registra o que o Claude Code identificou.
- **Sem autenticação**: o "autor" do histórico é o nome configurado no navegador.
- **Responsivo**: verificado em 390 px (celular) e 768 px (tablet) via iframes. Não há rolagem horizontal, o menu lateral vira o botão ☰ e a planta ocupa 78% da altura. Não foi testado em aparelho físico (iOS/Android).
- **Áreas não medidas**: o quadro de ambientes do LOFT está vazio. A medição automática por segmentação de imagem foi testada e descartada por não ser confiável neste desenho (vazamento por janelas, vigas tracejadas e banheiros pequenos). As áreas devem ser medidas com a ferramenta **Área**.
- **Versão publicada (GitHub Pages)**:
  - os dados ficam no IndexedDB do navegador, sem backup em disco;
  - duas abas abertas ao mesmo tempo podem sobrescrever a mesma lacuna;
  - depois que o visitante edita o projeto de demonstração, a cópia dele no navegador prevalece sobre uma versão republicada;
  - o IndexedDB é compartilhado por todos os sites em `<usuário>.github.io`;
  - o PDF.js vem do cdnjs, com versão fixa e sem SRI, porque é import de módulo.
- **Números**: os campos financeiros aceitam pt-BR. "1.250" é lido como mil duzentos e cinquenta, e "1.250,50" como 1.250,5. A altura do revestimento só vira quantidade de parede quando há um único número no texto.

## Testes

- `npm test`: 83 testes, incluindo os 20 originais da v0.1 sem alteração. A importação de PDF é testada com um PDF gerado no próprio teste, usando o poppler real.
- Testado no Chrome, pelo DOM: as 8 telas sem erros; prancha em 5617 px com 27 marcadores na p.2; foco centraliza o marcador no meio da viewport; o marcador mantém a posição relativa exata após zoom e arraste; 100% e ajustar funcionam; fluxo respondida → em validação → validação recusada sem evidência → validada; histórico com 3 eventos; conflito de revisão (409); busca preservando o foco; lote com confirmação; atalho J; relatórios com recortes; sincronização externa detectada em menos de 6 s.
