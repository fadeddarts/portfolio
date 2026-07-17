(() => {
  "use strict";

  const canvas = document.getElementById("mesh");
  const ctx = canvas.getContext("2d", { alpha: false });
  const audioButton = document.getElementById("audioToggle");
  const audioLabel = document.getElementById("audioLabel");
  const forceButton = document.getElementById("forceToggle");
  const statusText = document.getElementById("statusText");
  const nodeCount = document.getElementById("nodeCount");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const embed = new URLSearchParams(window.location.search).get("embed") === "1";

  if (embed) document.body.classList.add("embed");

  let width = 1;
  let height = 1;
  let dpr = 1;
  let nodes = [];
  let edges = [];
  let pulses = [];
  let attracting = true;
  let lastTime = performance.now();
  let elapsed = 0;
  let audio = null;
  let audioLevel = 0;

  const pointer = { x: 0, y: 0, active: false };

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function makeNode(x = Math.random() * width, y = Math.random() * height) {
    return {
      x, y,
      homeX: x,
      homeY: y,
      vx: random(-0.08, 0.08),
      vy: random(-0.08, 0.08),
      size: random(1.1, 2.7),
      phase: random(0, Math.PI * 2)
    };
  }

  function resize() {
    const previousWidth = width;
    const previousHeight = height;
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const desired = Math.max(34, Math.min(96, Math.round((width * height) / 18000)));
    if (nodes.length) {
      const sx = width / previousWidth;
      const sy = height / previousHeight;
      nodes.forEach((node) => {
        node.x *= sx;
        node.y *= sy;
        node.homeX *= sx;
        node.homeY *= sy;
      });
    }
    while (nodes.length < desired) nodes.push(makeNode());
    if (nodes.length > desired) nodes.length = desired;
    nodeCount.textContent = `${String(nodes.length).padStart(2, "0")} nodes`;
  }

  function buildEdges() {
    edges = [];
    const threshold = Math.min(190, Math.max(112, width * 0.12));
    const thresholdSq = threshold * threshold;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < thresholdSq) {
          edges.push({ a: i, b: j, strength: 1 - Math.sqrt(distanceSq) / threshold });
        }
      }
    }
  }

  function updateNodes(delta) {
    const motion = reducedMotion.matches ? 0.15 : 1;
    const bass = audioLevel * 1.8;

    nodes.forEach((node) => {
      const wander = elapsed * 0.00035 + node.phase;
      node.vx += Math.cos(wander * 1.13) * 0.0025 * motion;
      node.vy += Math.sin(wander) * 0.0025 * motion;
      node.vx += (node.homeX - node.x) * 0.000025;
      node.vy += (node.homeY - node.y) * 0.000025;

      if (pointer.active) {
        const dx = pointer.x - node.x;
        const dy = pointer.y - node.y;
        const distanceSq = dx * dx + dy * dy;
        const radius = 230;
        if (distanceSq > 20 && distanceSq < radius * radius) {
          const distance = Math.sqrt(distanceSq);
          const force = (1 - distance / radius) * (attracting ? 0.038 : -0.075);
          node.vx += (dx / distance) * force * motion;
          node.vy += (dy / distance) * force * motion;
        }
      }

      node.vx *= 0.985;
      node.vy *= 0.985;
      node.x += node.vx * delta * motion * (1 + bass);
      node.y += node.vy * delta * motion * (1 + bass);

      if (node.x < -20) node.x = width + 20;
      if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      if (node.y > height + 20) node.y = -20;
    });
  }

  function emitPulse(x, y, automatic = false) {
    if (!nodes.length) return;
    let nearest = 0;
    let best = Infinity;
    nodes.forEach((node, index) => {
      const distance = (node.x - x) ** 2 + (node.y - y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    const options = edges.filter((edge) => edge.a === nearest || edge.b === nearest);
    if (!options.length) return;
    const edge = options[Math.floor(Math.random() * options.length)];
    pulses.push({
      from: nearest,
      to: edge.a === nearest ? edge.b : edge.a,
      progress: 0,
      speed: automatic ? random(0.006, 0.011) : 0.014,
      hops: automatic ? 2 : 4
    });
    if (pulses.length > 28) pulses.shift();
  }

  function updatePulses(delta) {
    pulses.forEach((pulse) => {
      pulse.progress += pulse.speed * delta;
      if (pulse.progress >= 1 && pulse.hops > 0) {
        const options = edges.filter((edge) =>
          (edge.a === pulse.to || edge.b === pulse.to) &&
          edge.a !== pulse.from && edge.b !== pulse.from
        );
        if (options.length) {
          const edge = options[Math.floor(Math.random() * options.length)];
          pulse.from = pulse.to;
          pulse.to = edge.a === pulse.to ? edge.b : edge.a;
          pulse.progress = 0;
          pulse.hops -= 1;
        }
      }
    });
    pulses = pulses.filter((pulse) => pulse.progress < 1 || pulse.hops > 0);
  }

  function sampleAudio() {
    if (!audio || audio.context.state !== "running") {
      audioLevel += (0 - audioLevel) * 0.08;
      return;
    }
    audio.analyser.getByteFrequencyData(audio.data);
    let total = 0;
    const limit = Math.min(32, audio.data.length);
    for (let i = 0; i < limit; i += 1) total += audio.data[i];
    const target = total / limit / 255;
    audioLevel += (target - audioLevel) * 0.18;
  }

  function draw() {
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
      pointer.active ? pointer.x : width * 0.58,
      pointer.active ? pointer.y : height * 0.48,
      0,
      pointer.active ? pointer.x : width * 0.58,
      pointer.active ? pointer.y : height * 0.48,
      Math.max(width, height) * 0.55
    );
    glow.addColorStop(0, `rgba(22,72,255,${0.08 + audioLevel * 0.16})`);
    glow.addColorStop(1, "rgba(5,5,5,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 0.65;
    edges.forEach((edge) => {
      const a = nodes[edge.a];
      const b = nodes[edge.b];
      ctx.strokeStyle = `rgba(241,240,235,${0.035 + edge.strength * 0.16 + audioLevel * 0.09})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    nodes.forEach((node) => {
      const oscillation = Math.sin(elapsed * 0.002 + node.phase) * 0.45;
      const radius = node.size + oscillation + audioLevel * 4;
      ctx.fillStyle = radius > 3.2 ? "#1648ff" : "rgba(241,240,235,0.9)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, Math.max(0.7, radius), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.shadowColor = "#1648ff";
    ctx.shadowBlur = 14;
    pulses.forEach((pulse) => {
      const from = nodes[pulse.from];
      const to = nodes[pulse.to];
      if (!from || !to) return;
      const t = Math.min(pulse.progress, 1);
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      ctx.fillStyle = "#4c72ff";
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + audioLevel * 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function frame(now) {
    const delta = Math.min(2.5, (now - lastTime) / 16.667);
    lastTime = now;
    elapsed += delta * 16.667;
    sampleAudio();
    updateNodes(delta);
    buildEdges();
    updatePulses(delta);
    if (!reducedMotion.matches && Math.random() < 0.006 + audioLevel * 0.025) {
      const seed = nodes[Math.floor(Math.random() * nodes.length)];
      emitPulse(seed.x, seed.y, true);
    }
    draw();
    requestAnimationFrame(frame);
  }

  async function createAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      statusText.textContent = "Audio unavailable / visual mode";
      audioButton.disabled = true;
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const oscillatorA = context.createOscillator();
    const oscillatorB = context.createOscillator();
    const gainA = context.createGain();
    const gainB = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    filter.type = "lowpass";
    filter.frequency.value = 680;
    filter.Q.value = 7;
    master.gain.value = 0.045;
    oscillatorA.type = "sine";
    oscillatorA.frequency.value = 82.41;
    oscillatorB.type = "triangle";
    oscillatorB.frequency.value = 123.47;
    gainA.gain.value = 0.65;
    gainB.gain.value = 0.15;
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 180;

    oscillatorA.connect(gainA).connect(filter);
    oscillatorB.connect(gainB).connect(filter);
    lfo.connect(lfoGain).connect(filter.frequency);
    filter.connect(analyser).connect(master).connect(context.destination);
    oscillatorA.start();
    oscillatorB.start();
    lfo.start();

    audio = {
      context,
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount)
    };
    await context.resume();
  }

  audioButton.addEventListener("click", async () => {
    try {
      if (!audio) {
        await createAudio();
        if (!audio) return;
      } else if (audio.context.state === "running") {
        await audio.context.suspend();
      } else {
        await audio.context.resume();
      }
      const active = audio.context.state === "running";
      audioButton.setAttribute("aria-pressed", String(active));
      audioLabel.textContent = active ? "Stop signal" : "Start signal";
      statusText.textContent = active ? "Signal live / reactive" : "Autonomous / silent";
    } catch {
      statusText.textContent = "Audio unavailable / visual mode";
      audioButton.disabled = true;
    }
  });

  forceButton.addEventListener("click", () => {
    attracting = !attracting;
    forceButton.setAttribute("aria-pressed", String(!attracting));
    forceButton.textContent = `Force: ${attracting ? "Attract" : "Repel"}`;
  });

  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.active = false; });
  canvas.addEventListener("pointerdown", (event) => emitPulse(event.clientX, event.clientY));
  window.addEventListener("resize", resize);

  resize();
  buildEdges();
  requestAnimationFrame(frame);
})();
