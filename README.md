# Marshal Organization

App pessoal de produtividade — **Dashboard · Rotina · Tasks · Finanças · Notes · Metas · Academia** — num visual dark/glassmorphism, rodando 100% local no seu PC com MySQL.

> Este ambiente de desenvolvimento **não tinha Node.js, Docker nem Git instalados** no momento em que o projeto foi gerado. Todo o código foi escrito e revisado, mas nunca executado aqui — siga os passos abaixo com atenção na primeira vez. Se algo não subir de primeira, veja [Troubleshooting](#troubleshooting).

## Pré-requisitos

Instale antes de começar (uma vez só):

1. **Node.js 20 LTS** — https://nodejs.org (inclui o `npm`)
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop (usado só para rodar o MySQL, você não precisa instalar MySQL manualmente)
3. **Git** (opcional, só se quiser versionar o projeto) — https://git-scm.com

Depois de instalar, feche e reabra o terminal para o PATH atualizar. Confirme com:

```powershell
node --version
npm --version
docker --version
```

## 1. Configurar variáveis de ambiente

Copie o arquivo de exemplo:

```powershell
Copy-Item .env.example .env
```

Os valores padrão já batem com o `docker-compose.yml` — não precisa editar nada pra rodar localmente.

## 2. Subir o MySQL (via Docker)

```powershell
docker compose up -d
```

Isso baixa a imagem do MySQL 8, cria o banco `momentum` e roda `database/schema.sql` +
`database/seed.sql` automaticamente **na primeira vez** que o container sobe (dados de
exemplo: rotinas com streak, transações, uma meta de 6 meses em andamento, planos de treino
agendados, tasks no Kanban, notas). Confirme que subiu certo:

```powershell
docker compose logs mysql --tail 30
```

Se você já tinha rodado antes e quiser resetar o banco do zero (**apaga os dados**):

```powershell
docker compose down -v
docker compose up -d
```

## 3. Instalar dependências e gerar o CSS

```powershell
npm install
npm run build:css
```

## 4. Rodar o app

**Opção A — Web app no navegador** (mais simples pra desenvolver):

```powershell
npm run dev
```

Abre o servidor em http://localhost:4000 com hot-reload do CSS e do servidor. Acesse essa URL
no navegador.

**Opção B — Janela nativa (Electron)**:

```powershell
npm run electron:dev
```

Abre o Momentum como um app desktop de verdade, numa janela própria (sem navegador).

## 5. Gerar um instalador .exe (opcional)

```powershell
npm run dist
```

Gera um instalador Windows (NSIS) em `release/`. Como é um app de uso único, o `.env` local
(com a senha do seu MySQL) é empacotado junto — não compartilhe o instalador gerado com
outras pessoas.

> Empacotar baixa os binários do Electron (~100MB) na primeira vez — precisa de internet.

## Estrutura do projeto

```
momentum/
├── docker-compose.yml   # MySQL local
├── database/            # schema.sql + seed.sql
├── server/               # API Express (routes/ + controllers/ + utils/)
├── client/               # front-end (HTML + Tailwind + JS puro em ES modules)
├── electron/             # wrapper desktop (main.js + preload.js)
└── .env                  # suas credenciais locais (não versionar)
```

Cada módulo (Rotina, Tasks, Finanças, Notes, Metas, Academia) tem seu arquivo em
`server/routes/` + `server/controllers/` no backend, e `client/js/pages/` no front. Rotina e
Tasks compartilham a mesma tabela `tasks` (diferenciadas pela flag `is_routine`), conforme o
schema.

## Troubleshooting

- **"Não foi possível conectar ao servidor" no navegador**: confirme que `npm run dev` (ou
  `electron:dev`) está rodando e que a porta 4000 não está em uso por outro processo.
- **Erro de conexão com o MySQL** (`ECONNREFUSED` no terminal do servidor): rode
  `docker compose ps` pra confirmar que o container `momentum_mysql` está `healthy`. Ele pode
  levar 10-20s pra ficar pronto na primeira subida.
- **Página em branco / erros no console sobre `/vendor/...`**: rode `npm install` de novo —
  as bibliotecas (Chart.js, GSAP, SortableJS, canvas-confetti, fontes) são servidas localmente
  a partir de `node_modules`, então precisam estar instaladas.
- **CSS não atualiza**: rode `npm run build:css` manualmente, ou use `npm run dev` que já
  observa mudanças (`watch:css`).
- **Quero recomeçar do zero**: `docker compose down -v` apaga o volume do MySQL; suba de novo
  com `docker compose up -d` pra recriar o schema + seed.

## Sobre os dados de exemplo

Todo o `database/seed.sql` usa datas relativas a `CURDATE()`, então os streaks, o heatmap de
rotina/treino e o comparativo financeiro mês-a-mês sempre fazem sentido, não importa quando
você rodar o projeto pela primeira vez.
