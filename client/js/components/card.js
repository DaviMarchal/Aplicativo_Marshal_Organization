// Card KPI reutilizável, com contador animado (count-up) dos números grandes.

/**
 * @param {{label:string, value:number, prefix?:string, suffix?:string, decimals?:number,
 *          delta?:number, deltaLabel?:string, icon?:string}} opts
 */
export function kpiCard({ label, value, prefix = "", suffix = "", decimals = 0, delta, deltaLabel, icon }) {
  const wrap = document.createElement("div");
  wrap.className = "glass-card card-hover p-5 flex flex-col gap-2 relative overflow-hidden";

  const deltaPositive = typeof delta === "number" && delta >= 0;
  const deltaHtml =
    typeof delta === "number"
      ? `<span class="text-xs font-medium ${deltaPositive ? "text-positive" : "text-negative"} flex items-center gap-1 font-mono">
           ${deltaPositive ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}% ${deltaLabel || ""}
         </span>`
      : "";

  wrap.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-label text-[11px] text-text-mid">${label}</span>
      ${icon ? `<span class="w-[18px] h-[18px] text-text-mid opacity-70 [&>svg]:w-full [&>svg]:h-full">${icon}</span>` : ""}
    </div>
    <div class="flex items-end gap-2 min-w-0">
      <span data-kpi-value class="text-2xl xl:text-3xl font-bold tabular text-text-hi truncate">${prefix}0${suffix}</span>
    </div>
    ${deltaHtml}
  `;

  const valueEl = wrap.querySelector("[data-kpi-value]");
  animateCountUp(valueEl, value, { prefix, suffix, decimals });

  return wrap;
}

/**
 * Anima um elemento de 0 até `value` usando requestAnimationFrame.
 */
export function animateCountUp(el, value, { prefix = "", suffix = "", decimals = 0, duration = 900 } = {}) {
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const current = from + (value - from) * eased;
    el.textContent = `${prefix}${formatNumber(current, decimals)}${suffix}`;
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = `${prefix}${formatNumber(value, decimals)}${suffix}`;
      el.classList.add("count-settle");
    }
  }
  requestAnimationFrame(tick);
}

function formatNumber(n, decimals) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Botão com efeito ripple ao clicar (ver .ripple-el em animations.css) */
export function attachRipple(buttonEl) {
  buttonEl.style.position = buttonEl.style.position || "relative";
  buttonEl.addEventListener("click", (e) => {
    const rect = buttonEl.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple-el";
    ripple.style.left = `${e.clientX - rect.left - 8}px`;
    ripple.style.top = `${e.clientY - rect.top - 8}px`;
    buttonEl.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
}

export function attachRippleAll(root = document) {
  root.querySelectorAll(".btn-accent, .btn-ghost").forEach(attachRipple);
}
