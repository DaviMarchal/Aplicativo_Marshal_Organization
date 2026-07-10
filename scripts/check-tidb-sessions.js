// Diagnóstico: confirma se a tabela "sessions" existe no TiDB Cloud e quantas
// linhas tem. Senha via arquivo (TIDB_PASSWORD_FILE) ou env var (TIDB_PASSWORD).
const fs = require("fs");
const mysql = require("mysql2/promise");

const HOST = "gateway01.us-east-1.prod.aws.tidbcloud.com";
const PORT = 4000;
const USER = "48UKduQToJtbB9M.root";
const DB_NAME = "momentum";
const PASSWORD = process.env.TIDB_PASSWORD || (process.env.TIDB_PASSWORD_FILE && fs.readFileSync(process.env.TIDB_PASSWORD_FILE, "utf8").trim());

if (!PASSWORD) {
  console.error("Defina TIDB_PASSWORD ou TIDB_PASSWORD_FILE antes de rodar.");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB_NAME, ssl: {} });
  const [tables] = await conn.query("SHOW TABLES LIKE 'sessions'");
  console.log("Tabela 'sessions' existe:", tables.length > 0);
  if (tables.length) {
    const [[count]] = await conn.query("SELECT COUNT(*) AS n FROM sessions");
    console.log("Linhas na tabela sessions:", count.n);
    const [rows] = await conn.query("SELECT session_id, expires FROM sessions ORDER BY expires DESC LIMIT 5");
    console.log("Últimas sessões:", JSON.stringify(rows, null, 2));
  }
  const [[userCount]] = await conn.query("SELECT COUNT(*) AS n FROM users");
  console.log("Total de usuários cadastrados:", userCount.n);
  await conn.end();
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
