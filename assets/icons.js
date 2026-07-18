/* Lucide icons (static v0.468.0) — local subset for identical PC/mobile rendering. */
(() => {
  "use strict";

  const PATHS = {
  'arrow-down-left': '<path d="M17 7 7 17" /> <path d="M17 17H7V7" />',
  'arrow-down-right': '<path d="m7 7 10 10" /> <path d="M17 7v10H7" />',
  'arrow-down': '<path d="M12 5v14" /> <path d="m19 12-7 7-7-7" />',
  'arrow-left': '<path d="m12 19-7-7 7-7" /> <path d="M19 12H5" />',
  'arrow-right': '<path d="M5 12h14" /> <path d="m12 5 7 7-7 7" />',
  'arrow-up-left': '<path d="M7 17V7h10" /> <path d="M17 17 7 7" />',
  'arrow-up-right': '<path d="M7 7h10v10" /> <path d="M7 17 17 7" />',
  'arrow-up': '<path d="m5 12 7-7 7 7" /> <path d="M12 19V5" />',
  'asterisk': '<path d="M12 6v12" /> <path d="M17.196 9 6.804 15" /> <path d="m6.804 9 10.392 6" />',
  'circle-dot': '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="1" />',
  'infinity': '<path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" />'
  };

  const CLASS_MAP = [
    ["icon-arrow--sw", "arrow-down-left"],
    ["icon-arrow--se", "arrow-down-right"],
    ["icon-arrow--nw", "arrow-up-left"],
    ["icon-arrow--n", "arrow-up"],
    ["icon-arrow--s", "arrow-down"],
    ["icon-arrow--e", "arrow-right"],
    ["icon-arrow--w", "arrow-left"],
    ["icon-arrow", "arrow-up-right"],
    ["icon-asterisk", "asterisk"],
    ["icon-target", "circle-dot"],
    ["icon-reset", "rotate-ccw"],
    ["icon-infinity", "infinity"],
  ];

  function resolveName(el) {
    if (el.dataset.lucide && PATHS[el.dataset.lucide]) return el.dataset.lucide;
    for (const [cls, name] of CLASS_MAP) {
      if (el.classList.contains(cls)) return name;
    }
    return null;
  }

  function svgFor(name) {
    const body = PATHS[name];
    if (!body) return null;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + body + "</svg>"
    );
  }

  function mountIcons(root) {
    const scope = root || document;
    scope
      .querySelectorAll(
        ".icon-arrow, .icon-asterisk, .icon-target, .icon-reset, .icon-infinity, [data-lucide]"
      )
      .forEach((el) => {
        if (el.dataset.iconMounted === "true") return;
        const name = resolveName(el);
        const markup = name && svgFor(name);
        if (!markup) return;
        el.innerHTML = markup;
        el.dataset.iconMounted = "true";
        if (!el.hasAttribute("aria-hidden")) el.setAttribute("aria-hidden", "true");
      });
  }

  window.mountLucideIcons = mountIcons;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountIcons());
  } else {
    mountIcons();
  }
})();
