import { useEffect, useRef } from "react";

// Fades a section in the first time it scrolls into view. Sections already on screen at
// mount are shown at once, and nothing is hidden when the observer is unavailable or motion
// is reduced, so content never depends on the animation.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight) return undefined;
    element.classList.add("rv-pre");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          element.classList.add("rv-in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}
