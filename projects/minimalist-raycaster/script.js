(() => {
  "use strict";

  const embedded = new URLSearchParams(location.search).get("embed") === "1";
  document.body.classList.toggle("embed", embedded);

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const status = document.querySelector("#status");
  const collectedLabel = document.querySelector("#collected");
  const sectorLabel = document.querySelector("#sector");
  const endPanel = document.querySelector("#end-panel");
  canvas.tabIndex = 0;

  const MAP = [
    "1111111111111111",
    "1000000010000001",
    "1011100010111101",
    "1000100000100001",
    "1100101110101101",
    "1000001000000001",
    "1011101011110101",
    "1000101000010001",
    "1010101111011101",
    "1010000001000001",
    "1011110101011101",
    "1000000101000001",
    "1011111101011101",
    "1000000000000001",
    "1011111111110001",
    "1111111111111111",
  ];
  const START = { x: 1.5, y: 1.5, angle: 0 };
  const NODE_POSITIONS = [
    [5.5, 1.5], [3.5, 5.5], [11.5, 5.5], [5.5, 9.5], [13.5, 13.5],
  ];
  const EXIT = { x: 14.35, y: 14.35 };
  const FOV = Math.PI / 3;
  const keys = Object.create(null);
  const player = { ...START };
  let nodes = [];
  let zBuffer = new Float32Array(1);
  let startedAt = performance.now();
  let finished = false;
  let flashUntil = 0;

  function isWall(x, y) {
    const row = MAP[Math.floor(y)];
    return !row || row[Math.floor(x)] !== "0";
  }

  function reset() {
    Object.assign(player, START);
    nodes = NODE_POSITIONS.map(([x, y]) => ({ x, y, collected: false }));
    startedAt = performance.now();
    finished = false;
    endPanel.hidden = true;
    collectedLabel.textContent = "0";
    status.textContent = "Find the cobalt signals";
    canvas.focus({ preventScroll: true });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.min(1000, Math.round(rect.width)));
    canvas.width = width;
    canvas.height = Math.max(240, Math.round(rect.height * width / Math.max(rect.width, 1)));
    zBuffer = new Float32Array(width);
  }
  new ResizeObserver(resize).observe(canvas);

  function movePlayer(distance) {
    const nx = player.x + Math.cos(player.angle) * distance;
    const ny = player.y + Math.sin(player.angle) * distance;
    const radius = .19;
    if (!isWall(nx + Math.sign(distance) * radius * Math.cos(player.angle), player.y)) player.x = nx;
    if (!isWall(player.x, ny + Math.sign(distance) * radius * Math.sin(player.angle))) player.y = ny;
  }

  function update(delta) {
    if (finished) return;
    const move = delta * 2.35;
    const turn = delta * 1.9;
    if (keys.forward) movePlayer(move);
    if (keys.backward) movePlayer(-move);
    if (keys.left) player.angle -= turn;
    if (keys.right) player.angle += turn;
    player.angle = (player.angle + Math.PI * 2) % (Math.PI * 2);

    let count = 0;
    nodes.forEach((node) => {
      if (!node.collected && Math.hypot(node.x - player.x, node.y - player.y) < .55) {
        node.collected = true;
        flashUntil = performance.now() + 260;
      }
      if (node.collected) count++;
    });
    collectedLabel.textContent = String(count);
    sectorLabel.textContent = `${String.fromCharCode(65 + Math.min(3, Math.floor(player.x / 4)))}—${String(Math.min(4, Math.floor(player.y / 4) + 1)).padStart(2, "0")}`;

    const allFound = count === nodes.length;
    status.textContent = allFound ? "Exit unlocked — find the white beacon" : `${nodes.length - count} signal${nodes.length - count === 1 ? "" : "s"} remaining`;
    if (allFound && Math.hypot(EXIT.x - player.x, EXIT.y - player.y) < .7) finish();
  }

  function finish() {
    finished = true;
    const seconds = Math.floor((performance.now() - startedAt) / 1000);
    document.querySelector("#finish-time").textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    endPanel.hidden = false;
    document.querySelector("#restart-end").focus();
  }

  function castWalls(width, height) {
    ctx.fillStyle = "#070707";
    ctx.fillRect(0, 0, width, height / 2);
    const floor = ctx.createLinearGradient(0, height / 2, 0, height);
    floor.addColorStop(0, "#242424");
    floor.addColorStop(1, "#080808");
    ctx.fillStyle = floor;
    ctx.fillRect(0, height / 2, width, height / 2);
    ctx.fillStyle = "#1646ff";
    ctx.fillRect(0, height / 2, width, 1);

    for (let x = 0; x < width; x++) {
      const cameraX = 2 * x / width - 1;
      const dirX = Math.cos(player.angle);
      const dirY = Math.sin(player.angle);
      const planeX = -dirY * Math.tan(FOV / 2);
      const planeY = dirX * Math.tan(FOV / 2);
      const rayX = dirX + planeX * cameraX;
      const rayY = dirY + planeY * cameraX;
      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);
      const deltaX = Math.abs(1 / rayX);
      const deltaY = Math.abs(1 / rayY);
      const stepX = rayX < 0 ? -1 : 1;
      const stepY = rayY < 0 ? -1 : 1;
      let sideX = rayX < 0 ? (player.x - mapX) * deltaX : (mapX + 1 - player.x) * deltaX;
      let sideY = rayY < 0 ? (player.y - mapY) * deltaY : (mapY + 1 - player.y) * deltaY;
      let side = 0;

      while (!isWall(mapX, mapY)) {
        if (sideX < sideY) {
          sideX += deltaX;
          mapX += stepX;
          side = 0;
        } else {
          sideY += deltaY;
          mapY += stepY;
          side = 1;
        }
      }
      const distance = Math.max(.001, side === 0
        ? (mapX - player.x + (1 - stepX) / 2) / rayX
        : (mapY - player.y + (1 - stepY) / 2) / rayY);
      zBuffer[x] = distance;
      const wallHeight = Math.min(height * 2, Math.floor(height / distance));
      const top = Math.floor((height - wallHeight) / 2);
      const shade = Math.max(18, Math.floor(205 / (1 + distance * .15) * (side ? .72 : 1)));
      const accent = (mapX + mapY) % 7 === 0;
      ctx.fillStyle = accent
        ? `rgb(${Math.floor(shade * .08)},${Math.floor(shade * .22)},${Math.min(255, shade + 55)})`
        : `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x, top, 1, wallHeight);
      if (wallHeight > 8 && x % Math.max(1, Math.floor(width / 180)) === 0) {
        ctx.fillStyle = "rgba(0,0,0,.08)";
        ctx.fillRect(x, top, 1, wallHeight);
      }
    }
  }

  function drawSprite(sprite, color, scale = .52, diamond = true) {
    const dx = sprite.x - player.x;
    const dy = sprite.y - player.y;
    const distance = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx) - player.angle;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) > FOV * .72) return;

    const screenX = canvas.width * (.5 + angle / FOV);
    const size = Math.min(canvas.height, canvas.height / distance * scale);
    const left = Math.floor(screenX - size / 2);
    const centerColumn = Math.max(0, Math.min(canvas.width - 1, Math.floor(screenX)));
    if (distance >= zBuffer[centerColumn] + .2) return;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.min(34, size * .22);
    ctx.fillStyle = color;
    if (diamond) {
      ctx.translate(screenX, canvas.height / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-size * .28, -size * .28, size * .56, size * .56);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, size * .025);
      ctx.strokeRect(-size * .36, -size * .36, size * .72, size * .72);
    } else {
      const top = canvas.height / 2 - size * .68;
      ctx.fillRect(left + size * .26, top, size * .48, size * 1.36);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, size * .05);
      ctx.strokeRect(left + size * .15, top - size * .1, size * .7, size * 1.56);
    }
    ctx.restore();
  }

  function drawMinimap() {
    const scale = Math.max(4, Math.min(7, canvas.width / 110));
    const mapSize = MAP.length * scale;
    const x0 = 18;
    const y0 = canvas.height - mapSize - 18;
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fillRect(x0 - 7, y0 - 7, mapSize + 14, mapSize + 14);
    for (let y = 0; y < MAP.length; y++) {
      for (let x = 0; x < MAP[y].length; x++) {
        ctx.fillStyle = MAP[y][x] === "1" ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.035)";
        ctx.fillRect(x0 + x * scale, y0 + y * scale, scale - .5, scale - .5);
      }
    }
    nodes.forEach((node) => {
      if (!node.collected) {
        ctx.fillStyle = "#1646ff";
        ctx.fillRect(x0 + node.x * scale - 2, y0 + node.y * scale - 2, 4, 4);
      }
    });
    ctx.fillStyle = nodes.every((node) => node.collected) ? "#ffffff" : "#666666";
    ctx.fillRect(x0 + EXIT.x * scale - 2, y0 + EXIT.y * scale - 2, 4, 4);
    ctx.save();
    ctx.translate(x0 + player.x * scale, y0 + player.y * scale);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -3.5);
    ctx.lineTo(-4, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function render() {
    castWalls(canvas.width, canvas.height);
    const sprites = nodes.filter((node) => !node.collected)
      .map((node) => ({ ...node, distance: Math.hypot(node.x - player.x, node.y - player.y) }))
      .sort((a, b) => b.distance - a.distance);
    sprites.forEach((node) => drawSprite(node, "#1646ff"));
    drawSprite(EXIT, nodes.every((node) => node.collected) ? "#ffffff" : "#585858", .7, false);
    drawMinimap();
    if (performance.now() < flashUntil) {
      ctx.fillStyle = "rgba(22,70,255,.22)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.strokeStyle = "rgba(255,255,255,.72)";
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 7, canvas.height / 2);
    ctx.lineTo(canvas.width / 2 + 7, canvas.height / 2);
    ctx.moveTo(canvas.width / 2, canvas.height / 2 - 7);
    ctx.lineTo(canvas.width / 2, canvas.height / 2 + 7);
    ctx.stroke();
  }

  const keyMap = {
    w: "forward", arrowup: "forward", s: "backward", arrowdown: "backward",
    a: "left", arrowleft: "left", d: "right", arrowright: "right",
  };
  addEventListener("keydown", (event) => {
    const control = keyMap[event.key.toLowerCase()];
    if (control) {
      keys[control] = true;
      event.preventDefault();
    }
    if (event.key.toLowerCase() === "r") reset();
  });
  addEventListener("keyup", (event) => {
    const control = keyMap[event.key.toLowerCase()];
    if (control) {
      keys[control] = false;
      event.preventDefault();
    }
  });
  addEventListener("blur", () => Object.keys(keys).forEach((key) => { keys[key] = false; }));
  canvas.addEventListener("pointerdown", () => canvas.focus());

  document.querySelectorAll("[data-control]").forEach((button) => {
    const control = button.dataset.control;
    const stop = () => {
      keys[control] = false;
      button.classList.remove("active");
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      keys[control] = true;
      button.classList.add("active");
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  });
  document.querySelector("#restart-top").addEventListener("click", reset);
  document.querySelector("#restart-end").addEventListener("click", reset);

  let previous = performance.now();
  function loop(now) {
    const delta = Math.min((now - previous) / 1000, .05);
    previous = now;
    update(delta);
    render();
    requestAnimationFrame(loop);
  }
  reset();
  requestAnimationFrame(loop);
})();
