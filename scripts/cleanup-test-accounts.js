// Remove as contas de teste (e2e) criadas durante a validação do deploy web.
// Uso: TIDB_PASSWORD_FILE=<caminho> node scripts/cleanup-test-accounts.js
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
  const [rows] = await conn.query("SELECT id, email FROM users WHERE email LIKE 'teste-e2e%'");
  console.log(`Encontradas ${rows.length} contas de teste:`, rows.map((r) => r.email));
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    await conn.query(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    console.log("Contas de teste removidas.");
  }
  await conn.query("DELETE FROM sessions");
  console.log("Sessões antigas limpas.");
  const [[remaining]] = await conn.query("SELECT COUNT(*) AS n FROM users");
  console.log("Usuários restantes (reais):", remaining.n);
  await conn.end();
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
