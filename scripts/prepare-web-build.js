// Só usado pelo deploy web (Netlify). No desktop/dev, server/index.js serve
// essas libs direto de node_modules (rotas /vendor/*) — a Netlify não tem
// servidor nenhum, só arquivos estáticos, então esse script copia as MESMAS
// libs (mesmas pastas, mesmo mapeamento) pra dentro de client/vendor antes
// do deploy. Rodar de novo sempre que uma dessas libs for atualizada.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const nm = (...p) => path.join(ROOT, "node_modules", ...p);
const dest = (...p) => path.join(ROOT, "client", "vendor", ...p);

// mesmo mapeamento das rotas /vendor/* em server/index.js
const COPIES = [
  [nm("chart.js", "dist"), dest("chart.js")],
  [nm("gsap", "dist"), dest("gsap")],
  [nm("sortablejs"), dest("sortablejs")],
  [nm("canvas-confetti", "dist"), dest("canvas-confetti")],
  [nm("@fontsource", "inter"), dest("fonts", "inter")],
  [nm("@fontsource", "jetbrains-mono"), dest("fonts", "jetbrains-mono")],
];

for (const [from, to] of COPIES) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`copied ${path.relative(ROOT, from)} -> ${path.relative(ROOT, to)}`);
}

console.log("Vendor assets prontos em client/vendor/.");
