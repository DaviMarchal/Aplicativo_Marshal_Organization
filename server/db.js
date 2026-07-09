// Pool de conexões MySQL compartilhado por toda a aplicação.
const path = require("path");
// path explícito (não o padrão relativo a process.cwd()) — no app empacotado
// pelo Electron, o cwd de um processo aberto por atalho do Windows não é a
// pasta de instalação, então o .env nunca era encontrado e o driver caía
// silenciosamente pra senha vazia ("Access denied ... using password: NO").
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "momentum",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // datas/horas voltam como string 'YYYY-MM-DD', sem timezone shift do driver
  charset: "utf8mb4", // sem isso o driver conecta com um charset que corrompe acentos/emojis
  // Bancos gerenciados na nuvem (TiDB Cloud, PlanetScale, etc.) exigem TLS —
  // o MySQL local/embutido do desktop não usa e não precisa (DB_SSL fica de
  // fora do .env local). "true" liga TLS com verificação normal de certificado.
  ssl: process.env.DB_SSL === "true" ? {} : undefined,
});

module.exports = pool;
