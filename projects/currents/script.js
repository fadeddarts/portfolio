(() => {
  "use strict";

  const embedded = new URLSearchParams(location.search).get("embed") === "1";
  document.body.classList.toggle("embed", embedded);

  const canvas = document.querySelector("#currents");
  const coordinate = document.querySelector("#coordinate");
  const slider = document.querySelector("#position");
  const positionValue = document.querySelector("#positionValue");
  const leftButton = document.querySelector("#moveLeft");
  const rightButton = document.querySelector("#moveRight");
  const pauseButton = document.querySelector("#pauseMotion");
  const audioButton = document.querySelector("#audioToggle");
  const audioLabel = audioButton.querySelector("span");
  const audioStatus = document.querySelector("#audioStatus");
  const track = document.querySelector("#track");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    progress: 0.16,
    direction: 1,
    paused: reduceMotion,
    dragging: false,
    tween: null,
  };

  // Flow travels toward the screen's bottom-right, independent of the sphere.
  const FLOW = { x: 0.851, y: -0.525 }; // normalized direction (y up)
  const FLOW_SPEED = 0.052; // screen units per second

  let gl;
  let simProgram;
  let renderProgram;
  let quadBuffer;
  let textures = [];
  let framebuffers = [];
  let simWidth = 2;
  let simHeight = 2;
  let startTime = performance.now();
  let lastTime = startTime;
  let previousBall = ballPosition();

  const quadVertex = `
    attribute vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;

  // Shared helpers injected into both fragment shaders.
  const shaderCommon = `
    precision highp float;
    const float VEL_SCALE = 0.8;
    vec2 decodeVel(vec3 c) { return (c.rg - 0.5) / VEL_SCALE; }
    vec3 encodeField(vec2 v, float dye) { return vec3(v * VEL_SCALE + 0.5, dye); }
    float segmentDistance(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      return length(pa - ba * h);
    }
  `;

  // Simulation pass: advect the disturbance field, shed vortices behind the
  // obstacle, and let the sphere carve a hole in the current.
  const simFragment = `
    ${shaderCommon}
    uniform sampler2D uPrev;
    uniform vec2 uSimRes;
    uniform float uAspect;
    uniform vec2 uBall;
    uniform vec2 uBallPrev;
    uniform vec2 uFlowDir;
    uniform float uFlowSpeed;
    uniform float uTime;
    uniform float uDt;
    uniform float uActive;

    void main() {
      vec2 uv = gl_FragCoord.xy / uSimRes;
      vec2 flowNormal = vec2(-uFlowDir.y, uFlowDir.x);

      // Semi-Lagrangian advection in screen space, converted back to uv.
      vec2 selfVel = decodeVel(texture2D(uPrev, uv).rgb);
      vec2 totalVel = uFlowDir * uFlowSpeed + selfVel;
      vec2 uvStep = vec2(totalVel.x / uAspect, totalVel.y) * uDt;
      vec2 source = uv - uvStep;

      vec3 sampled = texture2D(uPrev, source).rgb;
      vec2 vel = decodeVel(sampled);
      float dye = sampled.b;

      // Slow decay keeps the wake alive long after the sphere has moved on.
      vel *= 0.992;
      dye *= 0.985;

      vec2 q = vec2(uv.x * uAspect, uv.y);
      vec2 ball = vec2(uBall.x * uAspect, uBall.y);
      vec2 ballPrev = vec2(uBallPrev.x * uAspect, uBallPrev.y);
      float radius = 0.13;

      vec2 rel = q - ball;
      float along = dot(rel, uFlowDir);
      float across = dot(rel, flowNormal);
      float dist = length(rel);

      // Alternating vortex shedding at the rear shoulders of the sphere.
      float rear = smoothstep(-0.02, 0.05, along);
      float band = exp(-across * across * 60.0);
      float shoulder = exp(-pow(dist - radius, 2.0) * 220.0);
      float shed = sin(uTime * 6.2 - along * 12.0);
      vec2 tangent = normalize(vec2(-rel.y, rel.x) + 1e-5);
      float strength = uActive * rear * (band * 0.55 + shoulder) * 2.4 * uDt;
      vel += tangent * shed * strength;
      vel += flowNormal * shed * rear * band * 1.3 * uDt * uActive;

      // Dye injected along the travelled segment so quick moves leave a trail.
      float trail = segmentDistance(q, ballPrev, ball);
      float inject = exp(-trail * trail * 150.0) * smoothstep(-0.04, 0.08, along);
      dye += inject * uActive * uDt * 5.5;
      dye = clamp(dye, 0.0, 1.4);

      // The sphere is solid: cancel the current inside it so lines part around.
      float solid = smoothstep(radius, radius - 0.012, dist);
      vel = mix(vel, -uFlowDir * uFlowSpeed, solid);
      dye = mix(dye, 0.0, solid);

      // Keep the field bounded for stability.
      float speed = length(vel);
      if (speed > 0.55) vel *= 0.55 / speed;

      gl_FragColor = vec4(encodeField(vel, dye), 1.0);
    }
  `;

  // Render pass: draw the flowing contour field, bend it with the persistent
  // disturbance, and composite the metallic sphere.
  const renderFragment = `
    ${shaderCommon}
    uniform sampler2D uField;
    uniform vec2 uResolution;
    uniform float uAspect;
    uniform vec2 uBall;
    uniform vec2 uFlowDir;
    uniform float uFlowSpeed;
    uniform float uTime;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      vec2 q = vec2(uv.x * uAspect, uv.y);
      vec2 flowNormal = vec2(-uFlowDir.y, uFlowDir.x);

      vec3 field = texture2D(uField, uv).rgb;
      vec2 disturb = decodeVel(field);
      float dye = field.b;

      vec2 ball = vec2(uBall.x * uAspect, uBall.y);
      vec2 rel = q - ball;
      float radius = 0.13;
      float r2 = max(dot(rel, rel), radius * radius * 1.02);

      // Immediate potential-flow parting right at the sphere.
      float alongLocal = dot(rel, uFlowDir);
      float acrossLocal = dot(rel, flowNormal);
      float partAcross = acrossLocal * (1.0 - (radius * radius) / r2);

      // Contour value: lines run along the flow, spaced across it.
      float across = dot(q, flowNormal);
      float along = dot(q, uFlowDir);
      float displacement =
        dot(disturb, flowNormal) * 0.85
        + (partAcross - acrossLocal)
        + dye * 0.05 * sin(along * 26.0 - uTime * 3.0);

      float value = (across + displacement) * 30.0;
      float stripeDistance = abs(fract(value) - 0.5);
      float stripe = smoothstep(0.11, 0.02, stripeDistance);
      float hairline = smoothstep(0.03, 0.008, stripeDistance);

      vec3 ink = vec3(0.03, 0.014, 0.05);
      vec3 violet = vec3(0.66, 0.44, 0.95);
      vec3 pale = vec3(0.96, 0.80, 1.0);
      vec3 color = mix(ink, violet, stripe * 0.85);
      color = mix(color, pale, hairline * 0.5);

      // Light travels down-current so the field reads as moving bottom-right.
      float travel = 0.5 + 0.5 * sin(along * 20.0 - uTime * 4.2);
      color += violet * stripe * travel * 0.18;

      // Disturbed regions glow warm, tracing the persistent wake.
      float energy = clamp(length(disturb) * 2.4 + dye * 0.9, 0.0, 1.0);
      vec3 wakeColor = mix(vec3(1.0, 0.10, 0.32), vec3(1.0, 0.66, 0.10), energy);
      color = mix(color, wakeColor, stripe * energy * 0.8);

      // Metallic sphere.
      float distanceToBall = length(rel);
      if (distanceToBall < radius) {
        vec2 normalXY = rel / radius;
        float normalZ = sqrt(max(0.0, 1.0 - dot(normalXY, normalXY)));
        vec3 normal = normalize(vec3(normalXY, normalZ));
        vec3 lightDir = normalize(vec3(-0.55, 0.72, 0.95));
        vec3 rimDir = normalize(vec3(0.8, -0.3, 0.4));
        float diffuse = max(dot(normal, lightDir), 0.0);
        float rim = pow(1.0 - normalZ, 2.6);
        float spec = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 52.0);
        float glint = pow(max(dot(reflect(-rimDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 90.0);
        vec3 metal = vec3(0.10) + diffuse * vec3(0.62, 0.64, 0.70);
        metal += rim * vec3(0.16, 0.08, 0.24);
        metal += spec * vec3(1.0);
        metal += glint * vec3(0.95, 0.72, 1.0) * 0.75;
        float edge = smoothstep(radius, radius - 0.008, distanceToBall);
        color = mix(color, metal, edge);
      }

      float grain = (hash(gl_FragCoord.xy + floor(uTime * 18.0)) - 0.5) * 0.045;
      float vignette = smoothstep(1.35, 0.2, length((uv - 0.5) * vec2(1.2, 1.0)));
      color *= 0.76 + vignette * 0.30;
      color += grain;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function createProgram(vertexSource, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function createFieldTexture(type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, simWidth, simHeight, 0, gl.RGBA, type, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, framebuffer };
  }

  function allocateFieldTargets() {
    let type = gl.UNSIGNED_BYTE;
    const halfFloat = gl.getExtension("OES_texture_half_float");
    gl.getExtension("OES_texture_half_float_linear");
    if (halfFloat) type = halfFloat.HALF_FLOAT_OES;

    textures = [];
    framebuffers = [];
    for (let i = 0; i < 2; i++) {
      const target = createFieldTexture(type);
      textures.push(target.texture);
      framebuffers.push(target.framebuffer);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, simWidth, simHeight);
      gl.clearColor(0.5, 0.5, 0.0, 1.0); // encoded zero velocity, zero dye
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function bindQuad(program) {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const location = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }

  function initializeWebGL() {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      canvas.style.background =
        "repeating-linear-gradient(125deg,#09070f 0 8px,#bc8eff 9px 11px,#09070f 12px 20px)";
      return false;
    }

    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    simProgram = createProgram(quadVertex, simFragment);
    renderProgram = createProgram(quadVertex, renderFragment);
    return true;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 1.75);
    const width = Math.max(2, Math.round(rect.width * dpr));
    const height = Math.max(2, Math.round(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;

      const targetWidth = Math.min(520, width);
      simWidth = Math.max(2, Math.round(targetWidth));
      simHeight = Math.max(2, Math.round(targetWidth * (height / width)));
      if (gl) allocateFieldTargets();
    }
  }

  function ballPosition() {
    return {
      x: 0.08 + state.progress * 0.84,
      y: 0.1 + state.progress * 0.68 - Math.sin(state.progress * Math.PI) * 0.1,
    };
  }

  function syncInterface() {
    const value = Math.round(state.progress * 1000);
    slider.value = String(value);
    positionValue.textContent = String(value).padStart(3, "0");
    coordinate.textContent = `X ${String(Math.round(state.progress * 100)).padStart(3, "0")} / FLOW ${
      state.direction > 0 ? ">" : "<"
    }`;
    leftButton.classList.toggle("active", state.direction < 0 && !state.paused);
    rightButton.classList.toggle("active", state.direction > 0 && !state.paused);
    pauseButton.classList.toggle("active", state.paused);
    pauseButton.setAttribute("aria-pressed", String(state.paused));
    pauseButton.textContent = state.paused ? "Resume" : "Pause";
  }

  function travel(direction = state.direction) {
    state.direction = direction;
    state.paused = false;
    state.tween?.kill();

    const target = direction > 0 ? 1 : 0;
    const distance = Math.abs(target - state.progress);
    if (distance < 0.001) {
      state.progress = target;
      travel(-direction);
      return;
    }

    if (window.gsap && !reduceMotion) {
      state.tween = gsap.to(state, {
        progress: target,
        duration: distance * 28,
        ease: "none",
        overwrite: true,
        onUpdate: syncInterface,
        onComplete: () => travel(-direction),
      });
    }

    syncInterface();
  }

  function pauseMotion() {
    state.paused = true;
    state.tween?.pause();
    syncInterface();
  }

  function resumeMotion() {
    if (state.tween) {
      state.paused = false;
      state.tween.resume();
      syncInterface();
    } else {
      travel(state.direction);
    }
  }

  function setProgressFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / rect.width;
    state.progress = Math.max(0, Math.min(1, (normalizedX - 0.08) / 0.84));
    syncInterface();
  }

  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    pauseMotion();
    canvas.setPointerCapture(event.pointerId);
    setProgressFromPointer(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (state.dragging) setProgressFromPointer(event);
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!state.dragging) return;
    state.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!reduceMotion) travel(state.direction);
  });

  canvas.addEventListener("pointercancel", () => {
    state.dragging = false;
  });

  slider.addEventListener("input", () => {
    pauseMotion();
    state.progress = Number(slider.value) / 1000;
    syncInterface();
  });

  slider.addEventListener("change", () => {
    if (!reduceMotion) travel(state.direction);
  });

  leftButton.addEventListener("click", () => travel(-1));
  rightButton.addEventListener("click", () => travel(1));
  pauseButton.addEventListener("click", () => {
    if (state.paused) resumeMotion();
    else pauseMotion();
  });

  audioButton.addEventListener("click", async () => {
    if (!track.paused) {
      track.pause();
      audioButton.setAttribute("aria-pressed", "false");
      audioLabel.textContent = "Play track";
      return;
    }

    try {
      await track.play();
      audioButton.setAttribute("aria-pressed", "true");
      audioLabel.textContent = "Pause track";
      audioStatus.textContent = "Licensed track playing";
    } catch {
      audioLabel.textContent = "Add track";
      audioStatus.textContent = "Place your licensed MP3 at assets/currents-track.mp3";
    }
  });

  track.addEventListener("error", () => {
    audioLabel.textContent = "Add track";
    audioStatus.textContent = "Place your licensed MP3 at assets/currents-track.mp3";
  });

  function simulate(ball, elapsed, delta) {
    bindQuad(simProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[1]);
    gl.viewport(0, 0, simWidth, simHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[0]);

    const aspect = canvas.width / canvas.height;
    gl.uniform1i(gl.getUniformLocation(simProgram, "uPrev"), 0);
    gl.uniform2f(gl.getUniformLocation(simProgram, "uSimRes"), simWidth, simHeight);
    gl.uniform1f(gl.getUniformLocation(simProgram, "uAspect"), aspect);
    gl.uniform2f(gl.getUniformLocation(simProgram, "uBall"), ball.x, ball.y);
    gl.uniform2f(gl.getUniformLocation(simProgram, "uBallPrev"), previousBall.x, previousBall.y);
    gl.uniform2f(gl.getUniformLocation(simProgram, "uFlowDir"), FLOW.x, FLOW.y);
    gl.uniform1f(gl.getUniformLocation(simProgram, "uFlowSpeed"), FLOW_SPEED);
    gl.uniform1f(gl.getUniformLocation(simProgram, "uTime"), elapsed);
    gl.uniform1f(gl.getUniformLocation(simProgram, "uDt"), delta);
    gl.uniform1f(gl.getUniformLocation(simProgram, "uActive"), reduceMotion ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    textures.reverse();
    framebuffers.reverse();
  }

  function draw(ball, elapsed) {
    bindQuad(renderProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[0]);

    const aspect = canvas.width / canvas.height;
    gl.uniform1i(gl.getUniformLocation(renderProgram, "uField"), 0);
    gl.uniform2f(gl.getUniformLocation(renderProgram, "uResolution"), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(renderProgram, "uAspect"), aspect);
    gl.uniform2f(gl.getUniformLocation(renderProgram, "uBall"), ball.x, ball.y);
    gl.uniform2f(gl.getUniformLocation(renderProgram, "uFlowDir"), FLOW.x, FLOW.y);
    gl.uniform1f(gl.getUniformLocation(renderProgram, "uFlowSpeed"), FLOW_SPEED);
    gl.uniform1f(gl.getUniformLocation(renderProgram, "uTime"), elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!gl || !simProgram) return;

    resize();
    const elapsed = reduceMotion ? 0 : (now - startTime) / 1000;
    const delta = Math.min(0.033, (now - lastTime) / 1000) || 0.016;
    lastTime = now;

    const ball = ballPosition();
    simulate(ball, elapsed, delta);
    draw(ball, elapsed);
    previousBall = ball;
  }

  new ResizeObserver(resize).observe(canvas);
  initializeWebGL();
  resize();
  syncInterface();
  if (!reduceMotion) travel(1);
  requestAnimationFrame(frame);
})();
