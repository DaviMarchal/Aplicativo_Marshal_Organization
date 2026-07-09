import { ICONS } from "./icons.js";

// Ícone: aceita um dos ICONS (markup SVG) ou, por retrocompatibilidade, um
// emoji/string simples — nesse caso cai pro sparkle padrão.
function iconBadge(icon) {
  const svg = icon && icon.trim().startsWith("<svg") ? icon : ICONS.sparkle;
  return `<div class="float-slow w-12 h-12 rounded-2xl flex items-center justify-center text-text-mid"
                style="background:var(--glass); border:1px solid var(--stroke);">
             <span class="w-6 h-6 [&>svg]:w-full [&>svg]:h-full">${svg}</span>
           </div>`;
}

// Empty state bonito (ícone + texto + CTA opcional) pra quando um módulo não tem dados ainda.
export function emptyState({ icon, title, subtitle = "", ctaLabel, onCta }) {
  const wrap = document.createElement("div");
  wrap.className = "glass-card flex flex-col items-center justify-center text-center py-16 px-6 gap-3";
  wrap.innerHTML = `
    ${iconBadge(icon)}
    <h3 class="text-text-hi font-semibold text-lg">${title}</h3>
    ${subtitle ? `<p class="text-text-mid text-sm max-w-sm">${subtitle}</p>` : ""}
    ${ctaLabel ? `<button type="button" data-cta class="btn-accent px-5 py-2.5 mt-2 text-sm">${ctaLabel}</button>` : ""}
  `;
  if (ctaLabel && onCta) {
    wrap.querySelector("[data-cta]").addEventListener("click", onCta);
  }
  return wrap;
}

export function emptyStateHtml({ icon, title, subtitle = "" }) {
  return `
    <div class="glass-card flex flex-col items-center justify-center text-center py-16 px-6 gap-3">
      ${iconBadge(icon)}
      <h3 class="text-text-hi font-semibold text-lg">${title}</h3>
      ${subtitle ? `<p class="text-text-mid text-sm max-w-sm">${subtitle}</p>` : ""}
    </div>
  `;
}
