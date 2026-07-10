// Roda uma vez só, pra preparar o banco no TiDB Cloud (deploy web): cria o
// banco de dados de verdade (não usa o "sys", que é interno do TiDB) e
// aplica o schema.sql nele. A senha nunca é digitada no chat — passa como
// variável de ambiente na hora de rodar, só no seu terminal:
//
//   PowerShell:  $env:TIDB_PASSWORD="sua_senha_aqui"; node scripts/setup-tidb.js
//
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const HOST = "gateway01.us-east-1.prod.aws.tidbcloud.com";
const PORT = 4000;
const USER = "48UKduQToJtbB9M.root";
const DB_NAME = "momentum";
const PASSWORD = process.env.TIDB_PASSWORD || (process.env.TIDB_PASSWORD_FILE && fs.readFileSync(process.env.TIDB_PASSWORD_FILE, "utf8").trim());

if (!PASSWORD) {
  console.error('Defina TIDB_PASSWORD antes de rodar. Ex.: $env:TIDB_PASSWORD="sua_senha"; node scripts/setup-tidb.js');
  process.exit(1);
}

async function main() {
  console.log("Conectando no TiDB Cloud...");
  const admin = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, ssl: {} });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
  await admin.end();
  console.log(`Banco "${DB_NAME}" pronto.`);

  const conn = await mysql.createConnection({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DB_NAME,
    ssl: {},
    multipleStatements: true,
  });
  const schemaSql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  await conn.query(schemaSql);
  const [tables] = await conn.query("SHOW TABLES");
  await conn.end();

  console.log(`Schema aplicado com sucesso! ${tables.length} tabelas criadas.`);
  console.log("\nNo Render, use estas variáveis:");
  console.log(`DB_HOST=${HOST}`);
  console.log(`DB_PORT=${PORT}`);
  console.log(`DB_USER=${USER}`);
  console.log(`DB_NAME=${DB_NAME}`);
  console.log("DB_SSL=true");
  console.log("DB_PASSWORD=(a mesma senha que você usou aqui)");
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
