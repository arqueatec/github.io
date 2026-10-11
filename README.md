# Rebanho — gestão de criação de ovinos em sociedade familiar

Aplicativo web (PWA, pensado primeiro para celular) para controlar o rebanho, os índices zootécnicos e as finanças de uma criação de ovinos com **duas partes financeiras**:

- **Parte A** — o administrador (1/3 por padrão)
- **Parte B** — os dois irmãos, tratados como uma única parte (2/3 por padrão)

Os três sócios lançam e consultam tudo. O sistema guarda qual irmão pagou cada despesa da Parte B, mas não faz acerto interno entre eles.

**Stack:** Next.js 16 (App Router), TypeScript, PostgreSQL, Drizzle ORM (migrações SQL), Zod, Tailwind CSS 4, Vitest. Compatível com a Vercel (funções serverless + Postgres gerenciado: Neon, Supabase, Vercel Postgres etc.).

---

## Funcionalidades

| Área | O que faz |
|---|---|
| **Rebanho** | Cadastro individual (brinco único, sexo, raça, nascimento real ou estimado, mãe, pai, categoria, lote, situação), foto, histórico completo por animal, genealogia (pais, avós, descendentes). Busca pelo brinco no topo de todas as telas. |
| **Inventário inicial** | Modo de anotação rápida no curral: um animal por vez, botões grandes, idade estimada por faixa, mãe opcional, foto opcional, contador de progresso em relação ao efetivo estimado, bloqueio de brinco duplicado (também offline) e resumo por categoria. |
| **Recontagem** | Lê os brincos no curral e compara com o sistema: lista os que faltam e os que apareceram sem estar cadastrados/ativos; registra a resolução. |
| **Reprodução** | Cobertura individual ou por estação de monta (várias matrizes, um reprodutor), diagnóstico de gestação opcional, parto (vivas, mortas, tipo, brinco e sexo de cada cria — as crias ganham ficha com mãe e pai), desmame com peso (cria passa a borrego). Previsão de parto = cobertura + 150 dias. |
| **Sanidade e manejo** | Vacina, vermifugação (FAMACHA opcional por animal), tratamentos, produto, dose, carência (bloqueia venda/abate/consumo até a data, com confirmação explícita), próxima dose, pesagem e escore corporal. Aplicação por lista de brincos, todo o rebanho ou lote. |
| **Alertas** | Próximas doses (e vencidas), partos previstos e animais em carência, na tela inicial. |
| **Baixas** | Morte (causa obrigatória), abate, consumo próprio e **venda** de um ou vários animais (por kg ou por cabeça, comprador, peso), gerando a receita automaticamente. Baixa pode ser desfeita (auditada). |
| **Despesas e receitas** | Data, valor, categoria, quem pagou/recebeu (a parte é derivada do usuário), comprovante em foto, animal/lote opcional. Prévia do efeito no saldo antes de salvar. |
| **Acerto de contas** | Saldo único corrente entre as partes, compensação automática, reembolsos (data, valor, forma de pagamento), extrato lançamento a lançamento com a fração de cada parte, o efeito e o saldo acumulado. |
| **Fechamento de período** | Ao registrar um acerto, os lançamentos até a data ficam travados para todos; só o administrador reabre (com motivo, auditado). |
| **Indicadores** | Filtros por período, parte e lote; fórmula de cada indicador exibida na tela (ver abaixo). |
| **Página da matriz** | Todos os partos com intervalo, crias (com desmame/baixa), diagnósticos, índices individuais e custos (diretos + rateio estimado). |
| **Relatórios** | CSV (separador `;`, abre no Excel) e PDF de rebanho, despesas, receitas, reembolsos, extrato, baixas, partos, sanidade, indicadores e ranking de matrizes. |
| **Importação** | Planilha CSV ou XLSX com validação linha a linha e gravação tudo-ou-nada; modelo para download. |
| **Administração** | Usuários (parte, perfil, ativo, redefinir senha), participações com histórico de vigência, categorias de despesa/receita, lotes, meta do inventário, trilha de auditoria. |

### Indicadores e fórmulas

| Indicador | Fórmula |
|---|---|
| Taxa de natalidade | crias nascidas (vivas + mortas) no período ÷ matrizes expostas × 100 |
| Taxa de parição | matrizes paridas no período ÷ matrizes expostas × 100 |
| Matrizes expostas | matrizes com cobertura cuja previsão de parto (cobertura + 150 d) cai no período + as que pariram no período sem cobertura registrada |
| Prolificidade | crias nascidas ÷ partos |
| Partos por matriz por ano | partos no período ÷ matrizes-ano (dias como matriz no efetivo ÷ 365); também 365 ÷ IEP |
| Intervalo entre partos (IEP) | média dos intervalos entre partos consecutivos — **só existe a partir do 2º parto registrado** da matriz |
| Mortalidade geral | mortes no período ÷ animais presentes em algum momento do período × 100 |
| Mortalidade de cordeiros até o desmame | crias nascidas vivas no período que morreram antes do desmame ÷ nascidas vivas × 100 (natimortos exibidos à parte) |
| Mortalidade de adultos | mortes de matrizes/reprodutores/descartes ÷ adultos presentes × 100 |
| Taxa de desmame | crias desmamadas (dos partos do período) ÷ nascidas vivas × 100 |
| Peso médio ao desmame | soma dos pesos ao desmame ÷ crias desmamadas pesadas |
| Custo por cabeça | despesas do período ÷ efetivo médio (dias-animal ÷ dias do período) |
| Resultado por parte | fração da parte nas receitas − fração da parte nas despesas (pela participação vigente na data de cada lançamento) |

**Histórico incompleto:** animais do inventário inicial podem ter nascimento e genealogia desconhecidos. O painel mostra um aviso com quantos animais vieram do inventário, quantos estão sem data de nascimento/mãe e para quantas matrizes o IEP pode ser calculado. A ficha da matriz informa que partos anteriores ao cadastro não estão no sistema.

**Matrizes improdutivas** (candidatas a descarte): sem parto há mais de 365 dias (ou sem nenhum parto em 365 dias como matriz), IEP médio acima de 365 dias, 2+ diagnósticos "vazia" desde o último parto, perda de metade ou mais das crias antes do desmame, ou já classificada como descarte. Matriz com diagnóstico "prenhe" recente não é marcada por falta de parto. Os limites ficam em `UNPRODUCTIVE_RULES` (`src/domain/indices.ts`).

### Regras do acerto entre as partes

Convenção do saldo: **positivo = Parte B deve à Parte A**; negativo = Parte A deve à Parte B.

| Lançamento | Efeito (com A = 1/3) |
|---|---|
| Despesa de R$ 300 paga pela Parte A | B passa a dever R$ 200 |
| Despesa de R$ 300 paga pela Parte B | A passa a dever R$ 100 |
| Receita de R$ 300 recebida pela Parte A | A passa a dever R$ 200 a B |
| Receita de R$ 300 recebida pela Parte B | B passa a dever R$ 100 a A |
| Reembolso de X de uma parte para a outra | abate X do saldo |

Despesas de um lado abatem automaticamente o que o outro deve (é um saldo único). **Arredondamento:** a fração da Parte A de cada lançamento é arredondada ao centavo (meio para cima) e a da Parte B é o restante — cada lançamento fecha exatamente (ex.: R$ 1,00 → A R$ 0,33, B R$ 0,67). Todos os valores são inteiros em centavos; não há ponto flutuante no cálculo. Os percentuais são guardados como **fração** (1/3 exato), configuráveis pelo administrador com data de início de vigência.

### Perfis e regras de acesso (verificadas no servidor)

- **Administrador:** gerencia usuários, participações, categorias, desativa lotes, reabre períodos, vê a auditoria.
- **Sócios (inclusive o administrador):** lançam e consultam tudo.
- **Lançamentos financeiros** (despesa, receita, reembolso): só **quem criou** pode editar ou excluir — inclusive o administrador não edita lançamento alheio (regra em `src/domain/policy.ts`, `canModifyFinancial`; mudar para permitir o admin é uma linha).
- **Período fechado:** ninguém cria, edita, exclui ou move lançamento para data ≤ data do fechamento; nova vigência de participação também não pode começar dentro dele.
- Todas as rotas de API exigem sessão válida (`authed` em `src/server/http.ts`), validam a entrada com Zod e rejeitam mutações de outra origem (proteção CSRF além do cookie `SameSite=Lax`). Páginas redirecionam para o login.
- Senhas com bcrypt; sessões aleatórias guardadas como hash no banco, cookie `httpOnly`; bloqueio de login após 8 tentativas erradas em 15 minutos.

### Auditoria

Criação, edição e exclusão de despesas, receitas, reembolsos, baixas de animais (e desfazer baixa), partos, cadastros/edições de animais, importações, usuários, participações, fechamentos e reaberturas ficam em `audit_log` com usuário, data/hora e o registro antes/depois. Lançamentos financeiros excluídos são apenas marcados (`deleted_at`), nunca apagados.

### Uso offline (PWA)

**Viável e implementado**, com estas características:

- O app é instalável ("Adicionar à tela inicial"). Um service worker guarda os arquivos estáticos e uma cópia das páginas já visitadas, que abrem sem sinal.
- Os formulários de lançamento (inventário, cadastro de animal, cobertura, diagnóstico, parto, desmame, sanidade, pesagem, baixa, venda, despesa, receita, reembolso, recontagem) enviam via API; **sem conexão, o lançamento vai para uma fila no próprio celular (IndexedDB)** e é reenviado automaticamente quando o sinal volta (evento `online` e a cada 30 s). Um selo no topo mostra quantos estão pendentes.
- Cada lançamento leva um `clientRef` (UUID): o servidor é **idempotente**, então reenvios não duplicam registros.
- A lista de brincos fica em cache local, então o bloqueio de brinco duplicado e as sugestões funcionam offline.
- Se o servidor recusar um lançamento da fila (ex.: brinco duplicado lançado por outro sócio, período fechado), ele fica marcado com o erro para o usuário corrigir ou descartar.
- **Limitações:** edições e exclusões exigem conexão; páginas nunca abertas no aparelho não estão disponíveis offline; dados exibidos offline podem estar desatualizados. No logout o cache de páginas é limpo.

---

## Rodando localmente

Requisitos: Node.js 20+ e PostgreSQL 14+.

```bash
npm install
cp .env.example .env           # ajuste DATABASE_URL e SESSION_SECRET
createdb ovinos                 # ou crie o banco pelo seu cliente
npm run db:migrate              # aplica as migrações (pasta drizzle/)
npm run db:seed                 # opcional: dados de demonstração
npm run dev                     # http://localhost:3000
```

Sem dados de demonstração, acesse `/setup` no primeiro acesso para criar o administrador (a tela só funciona enquanto não houver nenhum usuário) — ou rode `npm run admin:create` com `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env`.

### Dados de demonstração

`npm run db:reset` apaga o banco de `DATABASE_URL`, recria e popula (bloqueado em produção). Logins (senha `demo1234`):

| E-mail | Perfil | Parte |
|---|---|---|
| `admin@demo.com` | administrador | A |
| `bruno@demo.com` | sócio | B |
| `bernardo@demo.com` | sócio | B |

O seed executa ~400 eventos em ordem cronológica **através dos próprios serviços da aplicação** (mesmas validações, rateio e auditoria): 50 animais ativos (2 reprodutores, 30 matrizes com cerca de 2 anos de partos em 4 estações de monta, 18 borregos), crias vendidas/abatidas/mortas, vermifugações com FAMACHA, vacinas, tratamentos com carência, pesagens, despesas mensais pagas pelos três usuários, receitas (vendas, lã, esterco), reembolsos parciais e totais e um período fechado (1º semestre de 2025). A última estação tem matrizes prenhes com parto previsto, para os alertas aparecerem.

### Testes

```bash
npm test
```

- `tests/money.test.ts`, `tests/ledger.test.ts` — conversão de valores, rateio 1/3–2/3, vigência dos percentuais, compensação, reembolsos, saldo final e arredondamento de centavos.
- `tests/indices.test.ts` — cada índice zootécnico, efetivo e evolução, custo por cabeça, ranking e improdutivas.
- `tests/policy.test.ts` — regras de acesso.
- `tests/finance.int.test.ts`, `tests/herd.int.test.ts` — **integração com PostgreSQL real** (`TEST_DATABASE_URL`, o banco é apagado e recriado): parte derivada do pagador, compensação, extrato, idempotência offline, edição só pelo autor, auditoria, fechamento/reabertura, vigências, gestão de usuários, parto com crias e genealogia, venda gerando receita, carência, recontagem, importação, login/sessão/bloqueio. Sem `TEST_DATABASE_URL` esses testes são pulados.

Outros comandos: `npm run typecheck`, `npm run build`, `npm run db:generate` (gera nova migração após alterar `src/db/schema.ts`).

---

## Publicando na Vercel

1. **Banco:** crie um Postgres gerenciado (Vercel → Storage → Neon, ou Neon/Supabase diretamente). Use a URL **pooled** (pgbouncer); o app já usa `prepare: false`, compatível com pooler em modo transação.
2. **Projeto:** importe este repositório na Vercel (framework detectado: Next.js). Se o app ficar numa subpasta, ajuste *Root Directory*.
3. **Variáveis de ambiente** (Settings → Environment Variables), para Production e Preview:
   - `DATABASE_URL` — URL do Postgres
   - `SESSION_SECRET` — `openssl rand -base64 32`
   - opcional: `SESSION_DAYS`
4. **Deploy.** O script `vercel-build` roda `scripts/migrate.ts` (aplica migrações pendentes) e depois `next build`. Se `DATABASE_URL` faltar na Vercel, o build falha de propósito.
5. Acesse `https://seu-app.vercel.app/setup` e crie o administrador. Em **Administração**, cadastre os dois irmãos na Parte B e confira a participação (1/3 – 2/3 já vem configurada).
6. Rode o **Inventário rápido** no curral para anotar os 48 animais ainda não cadastrados (os 2 reprodutores podem ser cadastrados em *Cadastrar animal*).

Não rode `db:seed` em produção a menos que queira os dados fictícios.

> **Observação sobre este repositório:** ele tem um arquivo `CNAME` de GitHub Pages. Se o Pages estiver ativo, o GitHub publicará este README como site estático no domínio do `CNAME` — o app em si precisa da Vercel (ou outro host Node) e não roda no GitHub Pages.

---

## Organização do código

```
src/
  domain/         Regras puras e testáveis (sem banco)
    money.ts        centavos, frações, parsing "1.234,56"
    ledger.ts       rateio, efeito de cada lançamento, extrato, saldo
    indices.ts      índices zootécnicos, ranking, improdutivas
    policy.ts       regras de autorização
    dates.ts        datas de negócio (AAAA-MM-DD, fuso de São Paulo)
  db/             schema.ts (Drizzle) e conexão
  server/
    auth.ts         sessão, login, bloqueio por tentativas
    http.ts         wrapper das rotas: autenticação, CSRF, erros → JSON
    services/       casos de uso (finanças, rebanho, reprodução, sanidade, baixas,
                    inventário, dashboard, relatórios, importação, admin, auditoria)
  lib/schemas.ts  validação Zod compartilhada
  lib/client/     fila offline (IndexedDB), cliente da API, cache de brincos, fotos
  app/            páginas (App Router) e rotas /api
  components/     UI e formulários
drizzle/          migrações SQL (0000 estrutura, 0001 dados de referência e índices)
scripts/          migrate, seed, reset, create-admin
tests/            unitários e integração
public/           manifest, service worker, ícones
```

### Decisões técnicas

- **Saldo calculado, não armazenado:** o saldo é sempre recalculado a partir dos lançamentos (e da vigência de participação na data de cada um), o que elimina divergência entre saldo e extrato. Com o volume de uma criação familiar isso é instantâneo.
- **Fração em vez de percentual:** 1/3 não tem representação decimal exata; guardar numerador/denominador evita resíduos.
- **Parte "congelada" no lançamento:** a parte é derivada do usuário no momento do lançamento e gravada; mudar a parte de um usuário não reescreve o passado.
- **Fotos no Postgres (bytea):** comprimidas no celular (máx. 1280 px, JPEG) antes do envio. Evita depender de outro serviço de armazenamento; para grandes volumes troque por Vercel Blob/S3 em `saveAttachment` (`src/server/services/common.ts`).
- **Histórico de categoria e lote:** cada mudança é registrada com data, permitindo a evolução do efetivo por categoria no tempo.

## Limitações conhecidas / não implementado

- Filtro por **lote** nos indicadores usa o lote **atual** do animal (as mudanças de lote ficam registradas, mas os índices não as reconstroem no tempo). Despesas entram no filtro de lote quando vinculadas ao lote ou a um animal dele.
- O "custo associado" da matriz soma despesas vinculadas diretamente a ela + uma **estimativa** de rateio das despesas gerais por dias no rebanho.
- Edição/exclusão de coberturas, diagnósticos, desmames e pesagens não tem tela (parto sem crias pode ser excluído pela tela; aplicação sanitária e animal cadastrado por engano, via botão/API de exclusão — os demais são corrigidos com novo lançamento). Edição de lançamentos financeiros e do cadastro do animal estão completas.
- Sem leitura de brinco eletrônico (RFID/bastão) nem câmera para ler números — a digitação é manual.
- Sem notificações push; os alertas aparecem ao abrir o app.
- Fotos não ficam disponíveis offline depois de enviadas (apenas na fila antes do envio).
- `npm audit` acusa vulnerabilidade moderada em `uuid` dentro do `exceljs` (usado só no servidor para ler XLSX, sem a API afetada).
