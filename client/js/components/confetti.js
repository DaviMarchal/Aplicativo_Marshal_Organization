// Confetti ao concluir uma meta ou fechar um streak redondo (7/30 dias).
// window.confetti vem de /vendor/canvas-confetti/confetti.browser.js
export function celebrate() {
  if (typeof window.confetti !== "function") return;
  const colors = ["#FF7A00", "#FF9A3C", "#2365FF", "#6694FF", "#34D399"];
  window.confetti({
    particleCount: 120,
    spread: 80,
    origin: { y: 0.6 },
    colors,
  });
  setTimeout(() => {
    window.confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 }, colors });
  }, 200);
}
