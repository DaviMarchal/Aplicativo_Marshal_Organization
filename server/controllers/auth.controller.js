// Login/cadastro — só faz sentido no modo MULTI_USER=true (deploy web). No
// modo desktop essas rotas nem ficam registradas (ver server/index.js).
const bcrypt = require("bcryptjs");
const pool = require("../db");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function signup(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nome é obrigatório." });
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "E-mail inválido." });
    if (!password || password.length < 8) return res.status(400).json({ error: "Senha precisa ter pelo menos 8 caracteres." });

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await pool.query(`SELECT id FROM users WHERE email = ?`, [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "Já existe uma conta com esse e-mail." });

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    req.session.userId = result.insertId;
    res.status(201).json({ id: result.insertId, name: name.trim(), email: normalizedEmail });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "E-mail e senha são obrigatórios." });

    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
    const user = rows[0];
    // mensagem genérica pros dois casos (usuário não existe / senha errada) —
    // não dá pra um invasor descobrir se um e-mail está cadastrado ou não.
    const invalidMsg = { error: "E-mail ou senha incorretos." };
    if (!user || !user.password_hash) return res.status(401).json(invalidMsg);

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json(invalidMsg);

    req.session.userId = user.id;
    res.json({ id: user.id, name: user.name, email: user.email });
  } catch (err) {
    next(err);
  }
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("connect.sid");
    res.status(204).send();
  });
}

// req.userId já vem resolvido pelo middleware requireAuth — no modo desktop
// é sempre 1 (sem sessão de verdade); no modo web vem da sessão logada.
// Por isso essa rota é montada atrás do requireAuth (ver server/index.js):
// se não tiver sessão válida no modo web, nem chega aqui (401 já disparado).
async function me(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT id, name, email FROM users WHERE id = ?`, [req.userId]);
    if (!rows.length) return res.status(401).json({ error: "Não autenticado." });
    // multiUser: true diz pro frontend que existe uma sessão de verdade (logout
    // faz sentido mostrar); no modo desktop é sempre false — não tem de onde sair.
    res.json({ ...rows[0], multiUser: process.env.MULTI_USER === "true" });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, logout, me };
