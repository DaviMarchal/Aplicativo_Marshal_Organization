// Skeleton loaders (content placeholder shimmer).
export function skeletonBlock(className = "h-4 w-full") {
  return `<div class="skeleton ${className}"></div>`;
}

export function skeletonCard() {
  return `
    <div class="glass-card p-5 flex flex-col gap-3">
      ${skeletonBlock("h-3 w-1/3")}
      ${skeletonBlock("h-7 w-1/2")}
      ${skeletonBlock("h-3 w-1/4")}
    </div>
  `;
}

export function skeletonGrid(count = 4, cardFn = skeletonCard) {
  return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">${Array.from({ length: count })
    .map(() => cardFn())
    .join("")}</div>`;
}

export function skeletonList(count = 5) {
  return `<div class="flex flex-col gap-3">${Array.from({ length: count })
    .map(
      () => `
      <div class="glass-card p-4 flex items-center gap-3">
        ${skeletonBlock("h-9 w-9 rounded-full shrink-0")}
        <div class="flex-1 flex flex-col gap-2">
          ${skeletonBlock("h-3 w-2/3")}
          ${skeletonBlock("h-3 w-1/3")}
        </div>
      </div>`
    )
    .join("")}</div>`;
}
