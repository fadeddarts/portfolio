(() => {
  "use strict";

  const canvas = document.getElementById("clockCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hoursElement = document.getElementById("hours");
  const minutesElement = document.getElementById("minutes");
  const secondsElement = document.getElementById("seconds");
  const millisElement = document.getElementById("millis");
  const dayElement = document.getElementById("dayName");
  const dateElement = document.getElementById("fullDate");
  const zoneElement = document.getElementById("zoneLabel");
  const offsetElement = document.getElementById("offsetValue");
  const latElement = document.getElementById("latValue");
  const longElement = document.getElementById("longValue");
  const orbitButton = document.getElementById("orbitMode");
  const gridButton = document.getElementById("gridMode");
  const pauseButton = document.getElementById("pauseButton");
  const pauseLabel = document.getElementById("pauseLabel");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const embed = new URLSearchParams(window.location.search).get("embed") === "1";

  if (embed) document.body.classList.add("embed");

  let width = 1;
  let height = 1;
  let dpr = 1;
  let mode = "orbit";
  let modeMix = 0;
  let paused = false;
  let fieldTime = 0;
  let lastTime = performance.now();
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const particles = Array.from({ length: 54 }, (_, index) => ({
    index,
    angle: (index / 54) * Math.PI * 2,
    ring: index % 6,
    phase: ((index * 17) % 54) / 54 * Math.PI * 2,
    size: 1 + (index % 5) * 0.42
  }));

  const pad = (number, size = 2) => String(number).padStart(size, "0");

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getOffset(date) {
    const totalMinutes = -date.getTimezoneOffset();
    const sign = totalMinutes >= 0 ? "+" : "−";
    const absolute = Math.abs(totalMinutes);
    return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  }

  function updateTime() {
    const now = new Date();
    hoursElement.textContent = pad(now.getHours());
    minutesElement.textContent = pad(now.getMinutes());
    secondsElement.textContent = pad(now.getSeconds());
    millisElement.textContent = pad(now.getMilliseconds(), 3);
    dayElement.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long" })
      .format(now)
      .toUpperCase();
    dateElement.textContent = `${pad(now.getDate())} / ${pad(now.getMonth() + 1)} / ${now.getFullYear()}`;
    offsetElement.textContent = getOffset(now);
  }

  function setupZone() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
    const sections = zone.replaceAll("_", " ").split("/");
    zoneElement.innerHTML = `${sections[sections.length - 1].toUpperCase()}<br>TIME`;
  }

  function projectOrbit(particle, secondsProgress) {
    const ringRadius = Math.min(width, height) * (0.17 + particle.ring * 0.042);
    const speed = 0.055 + particle.ring * 0.009;
    const angle = particle.angle + fieldTime * speed + secondsProgress * Math.PI * 2;
    const tilt = 0.24 + particle.ring * 0.075;
    const x3 = Math.cos(angle) * ringRadius;
    const y3 = Math.sin(angle) * ringRadius;
    const z3 = Math.sin(angle + particle.phase) * ringRadius * 0.7;
    const perspective = 1 + z3 / Math.max(width, height) * 0.55;
    return {
      x: width * 0.5 + (x3 + pointer.x * (22 + particle.ring * 3)) * perspective,
      y: height * 0.5 + (y3 * tilt + pointer.y * (16 + particle.ring * 2)) * perspective,
      z: perspective
    };
  }

  function projectGrid(particle, secondsProgress) {
    const columns = 9;
    const row = Math.floor(particle.index / columns);
    const column = particle.index % columns;
    const spacingX = Math.min(width * 0.078, 94);
    const spacingY = Math.min(height * 0.085, 70);
    const wave = Math.sin(fieldTime * 0.7 + particle.phase + secondsProgress * Math.PI * 2);
    return {
      x: width * 0.5 + (column - 4) * spacingX + pointer.x * (12 + row * 2),
      y: height * 0.5 + (row - 2.5) * spacingY + wave * 13 + pointer.y * (10 + column),
      z: 1 + wave * 0.15
    };
  }

  function blend(a, b, amount) {
    return {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
      z: a.z + (b.z - a.z) * amount
    };
  }

  function drawBackground() {
    ctx.fillStyle = "#f1f0eb";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(7,7,7,0.075)";
    ctx.lineWidth = 1;
    const unit = Math.max(54, Math.min(width, height) / 10);
    const shiftX = pointer.x * 8;
    const shiftY = pointer.y * 8;
    for (let x = width / 2 % unit; x < width; x += unit) {
      ctx.beginPath();
      ctx.moveTo(x + shiftX, 0);
      ctx.lineTo(x - shiftX, height);
      ctx.stroke();
    }
    for (let y = height / 2 % unit; y < height; y += unit) {
      ctx.beginPath();
      ctx.moveTo(0, y + shiftY);
      ctx.lineTo(width, y - shiftY);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(22,72,255,0.34)";
    ctx.beginPath();
    ctx.moveTo(width * 0.5 - 8, height * 0.5);
    ctx.lineTo(width * 0.5 + 8, height * 0.5);
    ctx.moveTo(width * 0.5, height * 0.5 - 8);
    ctx.lineTo(width * 0.5, height * 0.5 + 8);
    ctx.stroke();
  }

  function drawGeometry(date) {
    const second = date.getSeconds() + date.getMilliseconds() / 1000;
    const secondsProgress = second / 60;
    const points = particles.map((particle) =>
      blend(projectOrbit(particle, secondsProgress), projectGrid(particle, secondsProgress), modeMix)
    );

    ctx.lineWidth = 0.7;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const next = points[(i + 1) % points.length];
      const vertical = points[(i + 9) % points.length];
      ctx.strokeStyle = `rgba(7,7,7,${0.06 + (i % 4) * 0.025})`;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(next.x, next.y);
      if (modeMix > 0.08) ctx.lineTo(vertical.x, vertical.y);
      ctx.stroke();
    }

    points.forEach((point, index) => {
      const isSecondMarker = index === Math.floor(second / 60 * points.length);
      const radius = particles[index].size * point.z * (isSecondMarker ? 2.4 : 1);
      ctx.fillStyle = isSecondMarker || index % 11 === 0 ? "#1648ff" : "rgba(7,7,7,0.72)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(0.7, radius), 0, Math.PI * 2);
      ctx.fill();
    });

    const radius = Math.min(width, height) * 0.34;
    ctx.strokeStyle = "rgba(7,7,7,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * secondsProgress);
    ctx.stroke();

    const markerAngle = -Math.PI / 2 + secondsProgress * Math.PI * 2;
    ctx.fillStyle = "#1648ff";
    ctx.beginPath();
    ctx.arc(
      width / 2 + Math.cos(markerAngle) * radius,
      height / 2 + Math.sin(markerAngle) * radius,
      4,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  function frame(now) {
    const delta = Math.min(50, now - lastTime);
    lastTime = now;
    if (!paused && !reducedMotion.matches) fieldTime += delta * 0.001;

    pointer.x += (pointer.targetX - pointer.x) * (reducedMotion.matches ? 1 : 0.06);
    pointer.y += (pointer.targetY - pointer.y) * (reducedMotion.matches ? 1 : 0.06);
    const targetMix = mode === "grid" ? 1 : 0;
    modeMix += (targetMix - modeMix) * (reducedMotion.matches ? 1 : 0.075);

    const date = new Date();
    updateTime();
    drawBackground();
    drawGeometry(date);
    requestAnimationFrame(frame);
  }

  function setMode(nextMode) {
    mode = nextMode;
    const orbitActive = mode === "orbit";
    orbitButton.classList.toggle("active", orbitActive);
    gridButton.classList.toggle("active", !orbitActive);
    orbitButton.setAttribute("aria-pressed", String(orbitActive));
    gridButton.setAttribute("aria-pressed", String(!orbitActive));
  }

  orbitButton.addEventListener("click", () => setMode("orbit"));
  gridButton.addEventListener("click", () => setMode("grid"));
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.setAttribute("aria-pressed", String(paused));
    pauseLabel.textContent = paused ? "Resume field" : "Pause field";
  });

  window.addEventListener("pointermove", (event) => {
    pointer.targetX = (event.clientX / width - 0.5) * 2;
    pointer.targetY = (event.clientY / height - 0.5) * 2;
    latElement.textContent = `${pointer.targetY >= 0 ? "+" : "−"}${Math.abs(pointer.targetY * 90).toFixed(3)}`;
    longElement.textContent = `${pointer.targetX >= 0 ? "+" : "−"}${Math.abs(pointer.targetX * 180).toFixed(3)}`;
  }, { passive: true });
  window.addEventListener("pointerleave", () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
  });
  window.addEventListener("resize", resize);

  resize();
  setupZone();
  updateTime();
  requestAnimationFrame(frame);
})();
