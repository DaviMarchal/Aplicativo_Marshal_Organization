// Scroll-reveal: anima elementos com GSAP (window.gsap, vendorizado) conforme
// entram na viewport via IntersectionObserver. Usado em listas que passam do
// fold inicial (não conflita com .anim-stagger-in, que já cobre o primeiro
// nível de cards visível no load).
export function revealOnScroll(elements) {
  const list = Array.from(elements).filter(Boolean);
  if (!list.length || typeof window.gsap === "undefined") return null;

  window.gsap.set(list, { opacity: 0, y: 18 });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        window.gsap.to(entry.target, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          delay: (i % 8) * 0.04,
          ease: "power3.out",
        });
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
  );

  list.forEach((el) => observer.observe(el));
  return observer;
}
