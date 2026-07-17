(() => {
  "use strict";

  document.body.classList.toggle("embed", new URLSearchParams(location.search).get("embed") === "1");

  const arena = document.querySelector("#arena");
  const layer = document.querySelector("#letters");
  const cursor = document.querySelector(".cursor");
  const coordinate = document.querySelector("#coordinate");
  const input = document.querySelector("#wordInput");
  const form = document.querySelector("#wordForm");
  const modeLabel = document.querySelector("#modeValue");
  const bodyCount = document.querySelector("#bodyCount");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const world = {
    bodies: [], width: 1, height: 1, mode: "form", gravity: .28,
    pointer: { x: -1000, y: -1000, px: 0, py: 0, inside: false, dragging: null },
    last: performance.now()
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const sizeFor = count => clamp(world.width / Math.max(count * .72, 4.4), 54, 142);

  function updateSize() {
    const rect = arena.getBoundingClientRect();
    world.width = rect.width;
    world.height = rect.height;
    layoutTargets();
  }

  function layoutTargets() {
    if (!world.bodies.length) return;
    const size = sizeFor(world.bodies.length);
    const spacing = size * .68;
    const start = world.width / 2 - spacing * (world.bodies.length - 1) / 2;
    world.bodies.forEach((body, index) => {
      body.tx = start + index * spacing;
      body.ty = world.height * .5;
      body.size = size;
      body.radius = size * .31;
      body.el.style.setProperty("--size", `${size}px`);
    });
  }

  function setWord(raw) {
    const text = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "TYPE";
    input.value = text;
    layer.replaceChildren();
    world.bodies = [...text].map((character, index) => {
      const el = document.createElement("span");
      el.className = "glyph";
      el.textContent = character;
      el.setAttribute("aria-hidden", "true");
      el.dataset.index = String(index);
      layer.append(el);
      return {
        el, x: world.width / 2, y: world.height / 2, tx: 0, ty: 0,
        vx: 0, vy: 0, angle: 0, va: 0, radius: 40, size: 80, mass: 1
      };
    });
    layer.setAttribute("aria-label", `The word ${text}, shown as ${text.length} physics bodies.`);
    bodyCount.textContent = String(text.length).padStart(2, "0");
    layoutTargets();
    reform(true);
  }

  function setMode(mode) {
    world.mode = mode;
    modeLabel.textContent = mode.toUpperCase();
  }

  function reform(immediate = false) {
    setMode("form");
    world.bodies.forEach(body => {
      if (immediate || reduceMotion) {
        body.x = body.tx; body.y = body.ty; body.angle = 0;
        body.vx = body.vy = body.va = 0;
      }
    });
  }

  function shatter() {
    setMode("free");
    world.bodies.forEach((body, index) => {
      const direction = (index / Math.max(1, world.bodies.length - 1) - .5) * Math.PI * 1.15 - Math.PI / 2;
      const power = reduceMotion ? 3 : 9 + Math.random() * 7;
      body.vx += Math.cos(direction) * power + (Math.random() - .5) * 5;
      body.vy += Math.sin(direction) * power - 5;
      body.va += (Math.random() - .5) * .32;
    });
  }

  function reset() {
    setWord(input.value);
    world.pointer.dragging = null;
  }

  function solveBodies() {
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let distance = Math.hypot(dx, dy) || .001;
        const overlap = a.radius + b.radius - distance;
        if (overlap > 0) {
          dx /= distance; dy /= distance;
          a.x -= dx * overlap * .5; a.y -= dy * overlap * .5;
          b.x += dx * overlap * .5; b.y += dy * overlap * .5;
          const relative = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
          if (relative < 0) {
            const impulse = -relative * .76;
            a.vx -= dx * impulse; a.vy -= dy * impulse;
            b.vx += dx * impulse; b.vy += dy * impulse;
            a.va -= impulse * .003; b.va += impulse * .003;
          }
        }
      }
    }
  }

  function tick(now) {
    const step = Math.min(1.8, (now - world.last) / 16.667);
    world.last = now;
    const p = world.pointer;
    world.bodies.forEach(body => {
      if (p.dragging === body) {
        body.vx = (p.x - body.x) * .26;
        body.vy = (p.y - body.y) * .26;
        body.x += body.vx * step; body.y += body.vy * step;
        body.va *= .8;
        return;
      }
      if (world.mode === "form") {
        body.vx += (body.tx - body.x) * .018 * step;
        body.vy += (body.ty - body.y) * .018 * step;
        body.va += -body.angle * .012 * step;
      } else {
        body.vy += world.gravity * step;
      }
      if (p.inside && !p.dragging) {
        const dx = body.x - p.x, dy = body.y - p.y;
        const distance = Math.hypot(dx, dy) || 1;
        const reach = body.radius + 82;
        if (distance < reach) {
          const force = (1 - distance / reach) * (reduceMotion ? .3 : 1.35);
          body.vx += dx / distance * force * step;
          body.vy += dy / distance * force * step;
          body.va += dx / distance * force * .006;
        }
      }
      body.vx *= world.mode === "form" ? .87 : .993;
      body.vy *= world.mode === "form" ? .87 : .993;
      body.va *= .987;
      body.x += body.vx * step; body.y += body.vy * step; body.angle += body.va * step;
      const margin = body.radius * .75;
      if (body.x < margin) { body.x = margin; body.vx = Math.abs(body.vx) * .72; body.va += .03; }
      if (body.x > world.width - margin) { body.x = world.width - margin; body.vx = -Math.abs(body.vx) * .72; body.va -= .03; }
      if (body.y < margin) { body.y = margin; body.vy = Math.abs(body.vy) * .72; }
      if (body.y > world.height - margin) {
        body.y = world.height - margin; body.vy = -Math.abs(body.vy) * .62;
        body.vx *= .96; if (Math.abs(body.vy) < .25) body.vy = 0;
      }
    });
    solveBodies();
    world.bodies.forEach(body => {
      body.el.style.transform = `translate3d(${body.x}px,${body.y}px,0) rotate(${body.angle}rad)`;
    });
    requestAnimationFrame(tick);
  }

  function pointerPosition(event) {
    const rect = arena.getBoundingClientRect();
    world.pointer.px = world.pointer.x;
    world.pointer.py = world.pointer.y;
    world.pointer.x = event.clientX - rect.left;
    world.pointer.y = event.clientY - rect.top;
    cursor.style.transform = `translate3d(${world.pointer.x}px,${world.pointer.y}px,0)`;
    coordinate.textContent = `X ${String(Math.round(world.pointer.x)).padStart(3,"0")} / Y ${String(Math.round(world.pointer.y)).padStart(3,"0")}`;
  }

  arena.addEventListener("pointerenter", event => { world.pointer.inside = true; pointerPosition(event); });
  arena.addEventListener("pointermove", event => {
    pointerPosition(event);
    if (world.pointer.dragging) event.preventDefault();
  });
  arena.addEventListener("pointerleave", () => { if (!world.pointer.dragging) world.pointer.inside = false; });
  arena.addEventListener("pointerdown", event => {
    pointerPosition(event);
    const glyph = event.target.closest(".glyph");
    if (!glyph) return;
    const body = world.bodies[Number(glyph.dataset.index)];
    world.pointer.dragging = body;
    body.el.classList.add("dragging");
    arena.setPointerCapture(event.pointerId);
  });
  arena.addEventListener("pointerup", event => {
    const body = world.pointer.dragging;
    if (!body) return;
    body.vx = (world.pointer.x - world.pointer.px) * .7;
    body.vy = (world.pointer.y - world.pointer.py) * .7;
    body.el.classList.remove("dragging");
    world.pointer.dragging = null;
    if (arena.hasPointerCapture(event.pointerId)) arena.releasePointerCapture(event.pointerId);
  });
  arena.addEventListener("pointercancel", () => {
    if (world.pointer.dragging) world.pointer.dragging.el.classList.remove("dragging");
    world.pointer.dragging = null;
  });

  form.addEventListener("submit", event => { event.preventDefault(); setWord(input.value); });
  input.addEventListener("input", () => {
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (input.value !== clean) input.value = clean;
  });
  document.querySelector("#shatter").addEventListener("click", shatter);
  document.querySelector("#reform").addEventListener("click", () => reform(false));
  document.querySelector("#reset").addEventListener("click", reset);

  new ResizeObserver(updateSize).observe(arena);
  updateSize();
  setWord(input.value);
  requestAnimationFrame(tick);
})();
