// Markdown básico e seguro pras Notes: **negrito**, *itálico*, listas com "- "
// e parágrafos. Escapa HTML primeiro (nunca confia no conteúdo do usuário)
// e só depois insere as tags — não usa nenhuma lib externa.
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(line) {
  return escapeHtml(line)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>");
}

export function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  let html = "";
  let inList = false;

  for (const rawLine of lines) {
    const listMatch = rawLine.match(/^\s*[-*]\s+(.*)/);
    if (listMatch) {
      if (!inList) {
        html += '<ul class="list-disc list-inside space-y-0.5">';
        inList = true;
      }
      html += `<li>${renderInline(listMatch[1])}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    html += rawLine.trim() ? `<p>${renderInline(rawLine)}</p>` : "<br>";
  }
  if (inList) html += "</ul>";
  return html;
}
