// Anel de progresso SVG (usado pela Meta de 180 dias e por outros % concluídos).
export function progressRing({ percent = 0, size = 160, stroke = 12, color = "var(--accent)", label = "" }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);

  const wrap = document.createElement("div");
  wrap.className = "relative inline-flex items-center justify-center";
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  wrap.innerHTML = `
    <svg class="progress-ring -rotate-90" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--stroke)" stroke-width="${stroke}" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
              stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="text-2xl font-bold tabular text-text-hi">${Math.round(percent)}%</span>
      ${label ? `<span class="font-label text-[10px] text-text-mid mt-1">${label}</span>` : ""}
    </div>
  `;

  // anima o preenchimento no próximo frame (precisa do valor inicial já pintado)
  const fillCircle = wrap.querySelectorAll("circle")[1];
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fillCircle.style.strokeDashoffset = String(offset);
    });
  });

  return wrap;
}
