// Processo principal do Electron. Sobe o mesmo servidor Express usado pelo
// `npm run dev` (server/index.js) dentro do próprio processo Node do Electron
// e abre uma janela nativa apontando pra ele — sem processo filho pro
// servidor. O MySQL, esse sim, é processo filho: é uma instalação "no-install"
// (zip), sem registro como serviço do Windows, então precisa ser subida
// manualmente a cada boot do app (ver ensureMysqlRunning).
//
// Duas situações bem diferentes usam esse mesmo código:
// - Dev (nesta máquina, `npm run electron:dev`): usa a pasta
//   %LOCALAPPDATA%\MomentumMySQL já existente, com o binário instalado
//   manualmente e os dados reais do Davi — nunca mexer no nome/local dela.
// - Empacotado (instalador rodando na máquina de outra pessoa, ex.: um
//   amigo): o binário do MySQL vem embutido no instalador (ver
//   build.extraResources no package.json) e cada instalação cria seu próprio
//   banco do zero, isolado, na primeira vez que abre (ver
//   bootstrapEmbeddedDatabase). Sem instalar nada a mais, sem conta
//   compartilhada com ninguém.
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const net = require("net");
const { spawn, execFile } = require("child_process");
const { startServer } = require("../server/index");

// Log de boot em arquivo — um app GUI subsystem não tem console anexado
// (console.log normal não vai a lugar nenhum), então se o app não abrir na
// máquina de alguém, pedir esse arquivo é o jeito de descobrir onde travou.
// Pequeno (poucas linhas por boot) e nunca grava senha/segredo nenhum.
const DEBUG_LOG = path.join(os.tmpdir(), "marshal-debug.log");
function dlog(...args) {
  try {
    if (fs.existsSync(DEBUG_LOG) && fs.statSync(DEBUG_LOG).size > 512 * 1024) fs.writeFileSync(DEBUG_LOG, "");
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${args.join(" ")}\n`);
  } catch {}
}
process.on("uncaughtException", (err) => dlog("UNCAUGHT:", err.stack || String(err)));
process.on("unhandledRejection", (err) => dlog("UNHANDLED REJECTION:", err?.stack || String(err)));
dlog("=== boot ===");

const PORT = process.env.PORT || 4000;

// path explícito, mesmo motivo do comentário em server/db.js: o cwd de um
// processo aberto por atalho do Windows não é confiável. No instalador
// empacotado não existe .env nenhum (ver package.json) — os defaults abaixo
// batem exatamente com o que bootstrapEmbeddedDatabase configura (root sem
// senha), então não precisa de credencial nenhuma pra funcionar.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "momentum";

const isPackaged = app.isPackaged;
dlog("isPackaged:", isPackaged, "resourcesPath:", process.resourcesPath);

// Nome de pasta diferente no empacotado — nunca colide com a pasta de dev
// desta máquina (que já tem dados reais) mesmo que alguém rode as duas
// versões no mesmo Windows.
const MYSQL_BASE = isPackaged
  ? path.join(os.homedir(), "AppData", "Local", "MarshalOrganizationMySQL")
  : path.join(os.homedir(), "AppData", "Local", "MomentumMySQL");
const MYSQL_DATADIR = path.join(MYSQL_BASE, "data");

let mainWindow;
let mysqlProcess = null;
let quitting = false;

function findMysqld() {
  if (isPackaged) {
    // binário embutido pelo electron-builder (extraResources) — caminho fixo,
    // sempre presente depois de instalado.
    const bundled = path.join(process.resourcesPath, "mysql-embedded", "bin", "mysqld.exe");
    return fs.existsSync(bundled) ? bundled : null;
  }
  if (!fs.existsSync(MYSQL_BASE)) return null;
  // a pasta do binário tem a versão no nome (mysql-8.4.9-winx64) — procura
  // em vez de fixar a versão, pra sobreviver a um upgrade manual do MySQL.
  const entries = fs.readdirSync(MYSQL_BASE, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith("mysql-"));
  for (const entry of entries) {
    const candidate = path.join(MYSQL_BASE, entry.name, "bin", "mysqld.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function isPortOpen(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForPort(host, port, { attempts = 40, intervalMs = 500 } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (await isPortOpen(host, port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function execFileAsync(file, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(file, args, opts, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.toString().trim() || err.message));
      resolve(stdout);
    });
  });
}

// Primeira vez que o app abre com um MYSQL_DATADIR vazio (sempre o caso pra
// quem acabou de instalar): cria o banco do zero, isolado de qualquer outra
// instalação. --initialize-insecure cria 'root'@'localhost' sem senha; como
// isso não cobre conexão via TCP em 127.0.0.1 de forma confiável em toda
// versão do MySQL, um --init-file roda ANTES do servidor aceitar conexões
// externas (privilégios internos, sem depender de autenticação nenhuma) pra
// garantir um root@'%' sem senha — mesmo usuário/senha vazios que DB_USER/
// DB_PASSWORD já assumem por padrão no topo deste arquivo.
async function bootstrapEmbeddedDatabase(mysqld, onStatus) {
  dlog("bootstrapEmbeddedDatabase: start, mysqld=", mysqld, "datadir=", MYSQL_DATADIR);
  onStatus?.("Preparando o banco de dados pela primeira vez…");
  fs.mkdirSync(MYSQL_BASE, { recursive: true });

  await execFileAsync(mysqld, [`--initialize-insecure`, `--datadir=${MYSQL_DATADIR}`], { timeout: 60000 });

  // usa DB_PASSWORD (vazio por padrão) em vez de fixar '' — se alguém rodar
  // isso com um .env customizado (senha própria pro usuário embutido), o
  // bootstrap tem que criar o grant com ESSA senha, senão db.js conecta com
  // DB_PASSWORD depois e nunca mais autentica (mismatch permanente).
  const escapedPassword = DB_PASSWORD.replace(/'/g, "''");
  const initFile = path.join(MYSQL_BASE, "bootstrap-init.sql");
  fs.writeFileSync(
    initFile,
    [
      `ALTER USER 'root'@'localhost' IDENTIFIED BY '${escapedPassword}';`,
      `CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '${escapedPassword}';`,
      `GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;`,
      `FLUSH PRIVILEGES;`,
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4;`,
    ].join("\n")
  );

  const stdout = fs.openSync(path.join(MYSQL_BASE, "stdout.log"), "a");
  const stderr = fs.openSync(path.join(MYSQL_BASE, "stderr.log"), "a");
  const bootProcess = spawn(
    mysqld,
    [`--datadir=${MYSQL_DATADIR}`, `--port=${DB_PORT}`, `--init-file=${initFile}`],
    { stdio: ["ignore", stdout, stderr], windowsHide: true }
  );

  try {
    const ready = await waitForPort(DB_HOST, DB_PORT);
    if (!ready) throw new Error(`O banco não respondeu durante a inicialização. Confira os logs em ${MYSQL_BASE}\\stderr.log.`);

    const mysql = require("mysql2/promise");
    const conn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      multipleStatements: true,
    });
    try {
      const schemaSql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
      await conn.query(schemaSql);
      // instalação nova: sem nome ainda — o app pergunta na primeira tela
      // (client/js/pages/first-run.js). schema.sql semeia 'Davi' só pro modo
      // docker/dev; aqui sobrescreve pra ficar em branco.
      await conn.query("UPDATE users SET name = '' WHERE id = 1");
    } finally {
      await conn.end();
    }
  } finally {
    // desliga o mysqld temporário do bootstrap e espera o PROCESSO terminar
    // de verdade (não só o comando de shutdown ser aceito) — ensureMysqlRunning
    // sobe a instância "definitiva" logo em seguida, na mesma porta; sem
    // esperar o processo antigo sair, o bind da nova instância pode falhar
    // (porta ainda ocupada) numa corrida.
    const exited = new Promise((resolve) => bootProcess.once("exit", resolve));
    await new Promise((resolve) => {
      const mysqladmin = path.join(path.dirname(mysqld), "mysqladmin.exe");
      execFile(
        mysqladmin,
        [`--host=${DB_HOST}`, `--port=${DB_PORT}`, "-u", DB_USER, "shutdown"],
        { timeout: 8000, env: { ...process.env, MYSQL_PWD: DB_PASSWORD } },
        (err) => {
          if (err) bootProcess.kill(); // desligamento limpo falhou — força mesmo assim
          resolve();
        }
      );
    });
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    fs.rmSync(initFile, { force: true });
  }
}

// Sobe o MySQL embutido se nada já estiver escutando em DB_HOST:DB_PORT (não
// mexe em nada se o usuário já tiver uma instância rodando por conta própria
// — serviço do Windows, outro MySQL manual, etc.).
async function ensureMysqlRunning(onStatus) {
  if (await isPortOpen(DB_HOST, DB_PORT, 400)) return;

  const mysqld = findMysqld();
  if (!mysqld) {
    throw new Error(
      `MySQL não está rodando em ${DB_HOST}:${DB_PORT} e o app não achou uma instalação embutida em ${MYSQL_BASE}. Inicie o MySQL manualmente e abra o app de novo.`
    );
  }

  if (!fs.existsSync(MYSQL_DATADIR)) {
    await bootstrapEmbeddedDatabase(mysqld, onStatus);
  }

  onStatus?.("Iniciando o banco de dados…");
  const stdout = fs.openSync(path.join(MYSQL_BASE, "stdout.log"), "a");
  const stderr = fs.openSync(path.join(MYSQL_BASE, "stderr.log"), "a");

  mysqlProcess = spawn(mysqld, [`--datadir=${MYSQL_DATADIR}`, `--port=${DB_PORT}`], {
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
  });
  mysqlProcess.on("error", (err) => {
    console.error("Falha ao iniciar o MySQL embutido:", err);
    mysqlProcess = null;
  });
  mysqlProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`MySQL embutido encerrou com código ${code}. Ver logs em ${MYSQL_BASE}.`);
    mysqlProcess = null;
  });

  const ready = await waitForPort(DB_HOST, DB_PORT);
  if (!ready) {
    throw new Error(`O MySQL embutido não respondeu a tempo. Confira os logs em ${MYSQL_BASE}\\stderr.log.`);
  }
}

// Encerramento limpo (flush do InnoDB) via mysqladmin em vez de matar o
// processo à força — só roda se foi esse processo do Momentum que subiu o
// MySQL (não mexe numa instância que já existia antes do app abrir).
function shutdownMysql() {
  return new Promise((resolve) => {
    if (!mysqlProcess) return resolve();
    const mysqld = findMysqld();
    const mysqladmin = mysqld ? path.join(path.dirname(mysqld), "mysqladmin.exe") : null;
    if (!mysqladmin || !fs.existsSync(mysqladmin)) {
      mysqlProcess.kill();
      return resolve();
    }
    execFile(
      mysqladmin,
      ["--host=" + DB_HOST, "--port=" + DB_PORT, "-u", DB_USER, "shutdown"],
      { timeout: 8000, env: { ...process.env, MYSQL_PWD: DB_PASSWORD } },
      (err) => {
        if (err) mysqlProcess?.kill(); // desligamento limpo falhou — força mesmo assim, não trava o fechamento do app
        resolve();
      }
    );
  });
}

async function createWindow() {
  dlog("createWindow: start");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0a0a0b",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "client", "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // links externos abrem no navegador padrão, não dentro da janela do app
  // (mesmo mecanismo usado pelo relatório mensal de Finanças pra abrir a
  // versão imprimível numa aba de verdade, com Ctrl+P funcionando)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // mostra alguma coisa na tela imediatamente — sem isso, a janela ficaria
  // em branco por vários segundos enquanto o MySQL embutido sobe, parecendo
  // que o app travou ou não abriu.
  dlog("createWindow: loading loading.html");
  await mainWindow.loadFile(path.join(__dirname, "loading.html"));
  dlog("createWindow: loading.html loaded, calling ensureMysqlRunning");

  await ensureMysqlRunning();
  dlog("createWindow: ensureMysqlRunning done, calling startServer");
  await startServer(PORT);
  dlog("createWindow: startServer done, loading app URL");
  await mainWindow.loadURL(`http://localhost:${PORT}`);
  dlog("createWindow: app URL loaded successfully");
}

dlog("registering app.whenReady()");
app.whenReady().then(() => {
  dlog("app.whenReady resolved");
  createWindow().catch((err) => {
    dlog("createWindow FAILED:", err.stack || String(err));
    console.error("Falha ao iniciar o Marshal Organization:", err);
    // Sem isso, uma falha ao subir o servidor (porta ocupada, MySQL fora do
    // ar, etc.) fecha o app sem nenhum aviso visível — parece simplesmente
    // "não abriu".
    const message =
      err?.code === "EADDRINUSE"
        ? `A porta ${PORT} já está em uso por outro programa (talvez outra instância do app já aberta). Feche o outro processo e tente de novo.`
        : `${err?.message || err}`;
    dialog.showErrorBox("Marshal Organization não conseguiu iniciar", message);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitting || !mysqlProcess) return;
  quitting = true;
  event.preventDefault();
  shutdownMysql().finally(() => app.quit());
});
