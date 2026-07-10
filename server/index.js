// Servidor Express — serve a API REST (/api/*) e os arquivos estáticos do
// client. Exporta startServer() para que tanto `npm start` quanto o processo
// principal do Electron possam subir o mesmo app no mesmo processo Node.
const path = require("path");
// path explícito — ver o comentário equivalente em db.js sobre por que o
// default relativo a process.cwd() não funciona no app empacotado.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const authRoutes = require("./routes/auth");
const routinesRoutes = require("./routes/routines");
const tasksRoutes = require("./routes/tasks");
const financeRoutes = require("./routes/finance");
const notesRoutes = require("./routes/notes");
const goalsRoutes = require("./routes/goals");
const workoutsRoutes = require("./routes/workouts");
const dashboardRoutes = require("./routes/dashboard");
const settingsRoutes = require("./routes/settings");
const { financeReport } = require("./controllers/report.controller");
const { requireAuth, MULTI_USER } = require("./middleware/auth");
const pool = require("./db");

function createApp() {
  const app = express();
  // limite maior que o padrão (100kb) — um backup completo (import/export
  // em Configurações) pode passar disso com muitas notas/transações
  app.use(express.json({ limit: "25mb" }));

  // Modo web: front (Netlify) e back (host separado) ficam em domínios
  // diferentes, então o cookie de sessão precisa de CORS com credenciais e
  // SameSite=None. Modo desktop nunca bate essa rota (tudo é localhost).
  if (MULTI_USER) {
    // O host do backend (Render, Railway, etc.) termina o HTTPS num proxy na
    // frente e repassa pro app por HTTP interno — sem isso, o Express acha
    // que toda conexão é insegura (req.secure = false) e o express-session
    // recusa mandar o cookie com cookie.secure=true, deixando o login "não
    // salvar" silenciosamente (sem erro nenhum, só nunca chega Set-Cookie).
    app.set("trust proxy", 1);

    app.use(
      cors({
        origin: (process.env.CORS_ORIGIN || "").split(",").filter(Boolean),
        credentials: true,
      })
    );

    app.use(
      session({
        key: "connect.sid",
        secret: process.env.SESSION_SECRET,
        store: new MySQLStore({}, pool.pool || pool),
        resave: false,
        saveUninitialized: false,
        cookie: {
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        },
      })
    );
  }

  // ---- Bibliotecas de terceiros servidas localmente (sem CDN, offline-first) ----
  const nm = (...p) => path.join(__dirname, "..", "node_modules", ...p);
  app.use("/vendor/chart.js", express.static(nm("chart.js", "dist")));
  app.use("/vendor/gsap", express.static(nm("gsap", "dist")));
  app.use("/vendor/sortablejs", express.static(nm("sortablejs")));
  app.use("/vendor/canvas-confetti", express.static(nm("canvas-confetti", "dist")));
  app.use("/vendor/fonts/inter", express.static(nm("@fontsource", "inter")));
  app.use("/vendor/fonts/jetbrains-mono", express.static(nm("@fontsource", "jetbrains-mono")));

  // ---- Client estático ----
  app.use(express.static(path.join(__dirname, "..", "client")));

  // ---- API ----
  // probe leve pro banner de "sem conexão" do front — não passa pelos
  // controllers porque precisa responder mesmo se uma tabela específica
  // estiver com problema; só confirma que o MySQL está respondendo.
  app.get("/api/health", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({
        ok: true,
        // diagnóstico temporário do bug de cookie de sessão no deploy web —
        // remover depois de confirmado. Revela se o commit novo (trust
        // proxy) já está no ar e como o Express está enxergando a conexão.
        debug: {
          trustProxy: app.get("trust proxy"),
          nodeEnv: process.env.NODE_ENV,
          multiUser: MULTI_USER,
          reqSecure: req.secure,
          xForwardedProto: req.headers["x-forwarded-proto"],
        },
      });
    } catch (err) {
      res.status(503).json({ ok: false, error: err.message });
    }
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/dashboard", requireAuth, dashboardRoutes);
  app.use("/api/routines", requireAuth, routinesRoutes);
  app.use("/api/tasks", requireAuth, tasksRoutes);
  app.use("/api/finance", requireAuth, financeRoutes);
  app.use("/api/notes", requireAuth, notesRoutes);
  app.use("/api/goals", requireAuth, goalsRoutes);
  app.use("/api/workouts", requireAuth, workoutsRoutes);
  app.use("/api/settings", requireAuth, settingsRoutes);

  // Relatório mensal — HTML autocontido fora do bundle da SPA, aberto numa
  // aba do navegador padrão (setWindowOpenHandler do Electron cuida disso)
  // pra usar o Ctrl+P/"Salvar como PDF" nativo do navegador.
  app.get("/print/finance-report", requireAuth, financeReport);

  // SPA fallback: qualquer rota que não seja /api, /vendor ou /print devolve o index.html
  app.get(/^(?!\/api|\/vendor|\/print).*/, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "client", "index.html"));
  });

  // ---- Tratamento central de erros ----
  app.use((req, res) => {
    res.status(404).json({ error: "Recurso não encontrado." });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Erro interno do servidor." });
  });

  return app;
}

function startServer(port = process.env.PORT || 4000) {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        console.log(`Marshal Organization rodando em http://localhost:${port}`);
        resolve(server);
      })
      .on("error", reject);
  });
}

module.exports = { createApp, startServer };

if (require.main === module) {
  startServer();
}
