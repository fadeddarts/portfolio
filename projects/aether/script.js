(() => {
  "use strict";

  const embed = new URLSearchParams(location.search).get("embed") === "1";
  document.body.classList.toggle("embed", embed);

  const canvas = document.querySelector("#fluid");
  const gate = document.querySelector("#audioGate");
  const audioButton = document.querySelector("#audioToggle");
  const audioButtonLabel = audioButton.querySelector("span");
  const resetButton = document.querySelector("#reset");
  const crosshair = document.querySelector(".crosshair");
  const energyValue = document.querySelector("#energyValue");
  const energyBar = document.querySelector("#energyBar");
  const freqValue = document.querySelector("#freqValue");
  const freqBar = document.querySelector("#freqBar");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let gl, program, front, back, frame = 0, resetField = true;
  let pointer = { x: .5, y: .5, px: .5, py: .5, vx: 0, vy: 0, down: 0 };
  let displayEnergy = 0;

  const vertexSource = `
    attribute vec2 p;
    varying vec2 uv;
    void main(){ uv=p*.5+.5; gl_Position=vec4(p,0.,1.); }
  `;
  const fragmentSource = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D prev;
    uniform vec2 res;
    uniform vec4 mouse;
    uniform float time;
    uniform float first;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 px=1./res;
      vec2 vel=mouse.zw*0.026;
      vec2 q=uv-vel;
      vec3 c=texture2D(prev,q).rgb*.982;
      vec3 n=(texture2D(prev,q+vec2(px.x,0)).rgb+texture2D(prev,q-vec2(px.x,0)).rgb+
              texture2D(prev,q+vec2(0,px.y)).rgb+texture2D(prev,q-vec2(0,px.y)).rgb)*.25;
      c=mix(c,n,.17);
      float d=length((uv-mouse.xy)*vec2(res.x/res.y,1.));
      float force=length(mouse.zw)*12.+mouse.w*.0;
      float splash=exp(-d*d*mix(1400.,180.,clamp(force,0.,1.)));
      vec3 cobalt=vec3(.015,.11,1.0);
      vec3 white=vec3(.92,.95,1.);
      c+=mix(cobalt,white,clamp(force,0.,1.))*splash*(.075+force*.48)*mouse.w;
      float wave=sin(d*68.-time*3.)*.5+.5;
      c+=cobalt*wave*exp(-d*11.)*.012;
      if(first>.5){
        float bands=sin(uv.x*8.+sin(uv.y*7.)+time*.08)*.5+.5;
        float grain=hash(floor(uv*res*.28))*.025;
        c=vec3(.005,.012,.035)+cobalt*bands*.055+grain;
      }
      c-=vec3(.0015,.001,.0002);
      gl_FragColor=vec4(max(c,0.),1.);
    }
  `;

  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
    return item;
  }

  function target(width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, fbo };
  }

  function resize() {
    if (!gl) return;
    const scale = Math.min(devicePixelRatio, reduceMotion ? 1 : 1.5);
    const width = Math.max(2, Math.floor(canvas.clientWidth * scale));
    const height = Math.max(2, Math.floor(canvas.clientHeight * scale));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width; canvas.height = height;
    if (front) { gl.deleteTexture(front.texture); gl.deleteFramebuffer(front.fbo); }
    if (back) { gl.deleteTexture(back.texture); gl.deleteFramebuffer(back.fbo); }
    front = target(width, height); back = target(width, height); resetField = true;
  }

  function initGL() {
    try {
      gl = canvas.getContext("webgl", { alpha:false, antialias:false, preserveDrawingBuffer:false });
      if (!gl) throw new Error("WebGL unavailable");
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
      resize();
      requestAnimationFrame(render);
    } catch (_) {
      document.querySelector("#fallback").hidden = false;
      canvas.style.background = "radial-gradient(circle at 50% 50%,#174dff,#061342 45%,#03030a)";
    }
  }

  function render(now) {
    resize();
    pointer.vx *= .91; pointer.vy *= .91;
    displayEnergy += ((Math.min(1, Math.hypot(pointer.vx, pointer.vy) * 18)) - displayEnergy) * .09;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, front.texture);
    gl.uniform1i(gl.getUniformLocation(program, "prev"), 0);
    gl.uniform2f(gl.getUniformLocation(program, "res"), canvas.width, canvas.height);
    gl.uniform4f(gl.getUniformLocation(program, "mouse"), pointer.x, pointer.y, pointer.vx, pointer.down || .32);
    gl.uniform1f(gl.getUniformLocation(program, "time"), now / 1000);
    gl.uniform1f(gl.getUniformLocation(program, "first"), resetField ? 1 : 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, back.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, back.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    [front, back] = [back, front];
    resetField = false; frame++;
    if (frame % 6 === 0) updateIndicators();
    if (!reduceMotion || pointer.down || frame < 4) requestAnimationFrame(render);
  }

  function updateIndicators() {
    const level = Math.round(displayEnergy * 99);
    const hz = Math.round(82 + pointer.x * 280);
    energyValue.textContent = String(level).padStart(2, "0");
    energyBar.style.width = `${Math.max(4, level)}%`;
    freqValue.textContent = `${hz} Hz`;
    freqBar.style.width = `${20 + pointer.x * 78}%`;
    synth.update(pointer.x, pointer.y, displayEnergy);
  }

  function move(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    pointer.vx = (x - pointer.x) * 2; pointer.vy = (y - pointer.y) * 2;
    pointer.px = pointer.x; pointer.py = pointer.y; pointer.x = x; pointer.y = y;
    crosshair.style.left = `${x * 100}%`; crosshair.style.top = `${(1-y) * 100}%`;
    if (reduceMotion) requestAnimationFrame(render);
  }
  canvas.addEventListener("pointerdown", e => { pointer.down = 1; canvas.setPointerCapture(e.pointerId); move(e); });
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", () => { pointer.down = 0; });
  canvas.addEventListener("pointercancel", () => { pointer.down = 0; });

  class Synth {
    constructor(){ this.ctx = null; this.muted = false; }
    async start() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0;
        this.filter = this.ctx.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.Q.value = 7;
        this.delay = this.ctx.createDelay(.6); this.delay.delayTime.value = .32;
        this.feedback = this.ctx.createGain(); this.feedback.gain.value = .28;
        this.delay.connect(this.feedback).connect(this.delay);
        this.filter.connect(this.master); this.filter.connect(this.delay); this.delay.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.oscillators = [0, 7, 12].map((semitones, index) => {
          const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
          osc.type = index === 0 ? "sine" : "triangle";
          gain.gain.value = [0.12, 0.035, 0.02][index];
          osc.connect(gain).connect(this.filter); osc.start();
          return { osc, semitones };
        });
      }
      await this.ctx.resume();
      this.muted = false;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(.34, this.ctx.currentTime + .8);
      return true;
    }
    toggleMute() {
      if (!this.ctx) return;
      this.muted = !this.muted;
      this.master.gain.setTargetAtTime(this.muted ? 0 : .34, this.ctx.currentTime, .08);
    }
    update(x, y, energy) {
      if (!this.ctx) return;
      const base = 82.41 * Math.pow(2, x * 1.7);
      this.oscillators.forEach(({osc,semitones}) => osc.frequency.setTargetAtTime(base*Math.pow(2,semitones/12),this.ctx.currentTime,.12));
      this.filter.frequency.setTargetAtTime(280 + y*2100 + energy*900, this.ctx.currentTime, .1);
    }
  }
  const synth = new Synth();

  async function startAudio() {
    if (!synth.ctx) {
      const started = await synth.start();
      if (!started) { audioButtonLabel.textContent = "Audio Unavailable"; return; }
      gate.classList.add("active");
      audioButtonLabel.textContent = "Mute Audio";
      audioButton.setAttribute("aria-pressed", "false");
    } else {
      synth.toggleMute();
      audioButtonLabel.textContent = synth.muted ? "Unmute Audio" : "Mute Audio";
      audioButton.setAttribute("aria-pressed", String(synth.muted));
    }
  }
  gate.addEventListener("click", startAudio);
  audioButton.addEventListener("click", startAudio);
  resetButton.addEventListener("click", () => {
    resetField = true; pointer = { x:.5,y:.5,px:.5,py:.5,vx:0,vy:0,down:0 };
    crosshair.style.left = "50%"; crosshair.style.top = "50%";
    if (reduceMotion) requestAnimationFrame(render);
  });
  addEventListener("resize", resize);
  setInterval(() => {
    document.querySelector("#clock").textContent = new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date());
  }, 1000);
  initGL();
})();
