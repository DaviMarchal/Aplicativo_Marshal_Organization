// Modo desktop (MULTI_USER != "true"): sempre usuário 1, sem sessão de verdade —
// preserva o comportamento atual do app empacotado, sem tela de login nenhuma.
// Modo web (MULTI_USER=true): exige sessão válida (cookie criado em /api/auth/login|signup).
const MULTI_USER = process.env.MULTI_USER === "true";

function requireAuth(req, res, next) {
  if (!MULTI_USER) {
    req.userId = 1;
    return next();
  }
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  req.userId = req.session.userId;
  next();
}

module.exports = { requireAuth, MULTI_USER };
