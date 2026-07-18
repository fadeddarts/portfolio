(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const hasGSAP = typeof window.gsap !== "undefined";

  if (hasGSAP && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  // Graceful placeholders keep the composition intact until real assets are added.
  document.querySelectorAll('img[src^="assets/"]').forEach((image) => {
    image.addEventListener("error", () => {
      image.classList.add("is-placeholder");
      image.alt = "";
    });
  });

  // Intro sequence
  const loader = document.querySelector(".loader");
  const loaderCounter = document.querySelector(".loader__counter");
  const loaderProgress = document.querySelector(".loader__line span");

  function completeLoader() {
    if (!loader || loader.dataset.complete) return;
    loader.dataset.complete = "true";

    if (!hasGSAP || reduceMotion) {
      loader.remove();
      return;
    }

    const intro = gsap.timeline({ defaults: { ease: "power4.inOut" } });
    intro
      .to(loaderProgress, { width: "100%", duration: 0.7 }, 0)
      .to({ value: 0 }, {
        value: 100,
        duration: 0.8,
        onUpdate() {
          loaderCounter.textContent = String(Math.round(this.targets()[0].value)).padStart(3, "0");
        },
      }, 0)
      .to(loader, { clipPath: "inset(0 0 100% 0)", duration: 1.1 })
      .from(".hero__line span", { yPercent: 110, rotate: 3, duration: 1.25, stagger: 0.08 }, "-=0.7")
      .from(".hero__eyebrow, .hero__footer", { opacity: 0, y: 16, duration: 0.7 }, "-=0.6")
      .set(loader, { display: "none" });
  }

  window.addEventListener("load", completeLoader);
  window.setTimeout(completeLoader, 2200);

  // Smooth scrolling
  let lenis;
  if (window.Lenis && !reduceMotion) {
    lenis = new Lenis({
      duration: 1.15,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.2,
      orientation: "vertical",
      gestureOrientation: "vertical",
    });

    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    if (hasGSAP && window.ScrollTrigger) {
      lenis.on("scroll", ScrollTrigger.update);
    }
  }

  // iOS can still rubber-band sideways past overflow-x:hidden. Snap back
  // without changing vertical sticky/scrub scroll dynamics.
  const lockHorizontalScroll = () => {
    if (window.scrollX) window.scrollTo(0, window.scrollY);
    if (document.documentElement.scrollLeft) document.documentElement.scrollLeft = 0;
    if (document.body.scrollLeft) document.body.scrollLeft = 0;
  };
  window.addEventListener("scroll", lockHorizontalScroll, { passive: true });
  window.addEventListener("resize", lockHorizontalScroll);

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (href.length < 2) return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      if (menuOpen) setMenu(false);
      if (lenis) lenis.scrollTo(target, { offset: 0, force: true });
      else target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
  });

  // Navigation
  const menuToggle = document.querySelector(".menu-toggle");
  const menu = document.querySelector(".menu");
  let menuOpen = false;

  function setMenu(open) {
    menuOpen = open;
    document.body.classList.toggle("menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    menuToggle.querySelector("span").textContent = open ? "Close" : "Menu";
    if (lenis) open ? lenis.stop() : lenis.start();

    if (!hasGSAP) {
      menu.style.visibility = open ? "visible" : "hidden";
      menu.style.clipPath = open ? "inset(0)" : "inset(0 0 100% 0)";
      return;
    }

    gsap.to(menu, {
      clipPath: open ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
      visibility: open ? "visible" : "hidden",
      duration: 0.8,
      ease: "power4.inOut",
    });
    gsap.fromTo(
      ".menu__links a",
      { yPercent: open ? 100 : 0, opacity: open ? 0 : 1 },
      { yPercent: open ? 0 : -30, opacity: open ? 1 : 0, stagger: 0.04, duration: 0.75, ease: "power4.out" }
    );
  }

  menuToggle?.addEventListener("click", () => setMenu(!menuOpen));
  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));

  // Fluid custom cursor and magnetic targets
  if (!isTouch && hasGSAP) {
    const dot = document.querySelector(".cursor--dot");
    const ring = document.querySelector(".cursor--ring");
    const ringLabel = ring.querySelector("span");
    const dotX = gsap.quickTo(dot, "x", { duration: 0.12, ease: "power3" });
    const dotY = gsap.quickTo(dot, "y", { duration: 0.12, ease: "power3" });
    const ringX = gsap.quickTo(ring, "x", { duration: 0.5, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: 0.5, ease: "power3" });

    window.addEventListener("pointermove", ({ clientX, clientY }) => {
      dotX(clientX);
      dotY(clientY);
      ringX(clientX);
      ringY(clientY);
    });

    document.querySelectorAll("a, button").forEach((target) => {
      target.addEventListener("mouseenter", () => ring.classList.add("is-active"));
      target.addEventListener("mouseleave", () => ring.classList.remove("is-active"));
    });

    document.querySelectorAll(".cursor-view").forEach((target) => {
      target.addEventListener("mouseenter", () => {
        ringLabel.textContent = target.dataset.cursor || "VIEW";
        ring.classList.add("is-view");
        gsap.fromTo(
          ringLabel,
          { opacity: 0, y: 5, rotate: -8 },
          { opacity: 1, y: 0, rotate: 0, duration: 0.3, ease: "power3.out" }
        );
      });
      target.addEventListener("mouseleave", () => {
        ring.classList.remove("is-view");
        gsap.to(ringLabel, { opacity: 0, duration: 0.15 });
      });
    });

    document.querySelectorAll(".magnetic").forEach((target) => {
      target.addEventListener("pointermove", (event) => {
        const rect = target.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        gsap.to(target, { x: x * 0.22, y: y * 0.22, duration: 0.35, ease: "power2.out" });
      });
      target.addEventListener("pointerleave", () => {
        gsap.to(target, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.3)" });
      });
    });
  }

  // Scroll-linked typography, horizontal stories, parallax, and reveals
  if (hasGSAP && window.ScrollTrigger) {
    const manifestoText = document.querySelector(".manifesto__text");
    const words = manifestoText.textContent.trim().split(/\s+/);
    manifestoText.innerHTML = words.map((word) => `<span class="word">${word}</span>`).join(" ");

    gsap.to(".manifesto__text .word", {
      color: "#0b0b0b",
      stagger: 0.08,
      ease: "none",
      scrollTrigger: {
        trigger: ".manifesto__text",
        start: "top 72%",
        end: "bottom 35%",
        scrub: true,
      },
    });

    document.querySelectorAll(".case-study").forEach((section) => {
      const track = section.querySelector(".case-study__track");
      const backdrop = section.querySelector(".case-study__backdrop");
      const getDistance = () => Math.max(0, track.scrollWidth - window.innerWidth);

      gsap.to(track, {
        x: () => -getDistance(),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.8,
          invalidateOnRefresh: true,
        },
      });

      gsap.fromTo(backdrop, { xPercent: -10 }, {
        xPercent: 10,
        ease: "none",
        scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: true },
      });
    });

    gsap.to(".statement__marquee > div", {
      xPercent: -45,
      ease: "none",
      scrollTrigger: { trigger: ".statement", start: "top bottom", end: "bottom top", scrub: 1 },
    });

    gsap.utils.toArray(".project-card").forEach((card, index) => {
      gsap.from(card, {
        y: 100,
        opacity: 0,
        duration: 1.1,
        ease: "power3.out",
        scrollTrigger: { trigger: card, start: "top 88%", toggleActions: "play none none reverse" },
        delay: index % 2 ? 0.1 : 0,
      });
    });

    document.querySelectorAll("[data-count]").forEach((counter) => {
      const value = Number(counter.dataset.count);
      const state = { value: 0 };
      gsap.to(state, {
        value,
        duration: 2,
        ease: "power3.out",
        onUpdate: () => { counter.textContent = String(Math.round(state.value)).padStart(2, "0"); },
        scrollTrigger: { trigger: counter, start: "top 85%", once: true },
      });
    });

    gsap.from(".process__title span", {
      xPercent: (index) => index ? 30 : -30,
      opacity: 0,
      stagger: 0.15,
      scrollTrigger: { trigger: ".process__title", start: "top 85%", end: "bottom 50%", scrub: 1 },
    });

    gsap.from(".contact h2", {
      yPercent: 35,
      opacity: 0,
      scrollTrigger: { trigger: ".contact", start: "top 70%", end: "center 60%", scrub: 1 },
    });

    ScrollTrigger.refresh();
  }

  // Reactive Three.js hero sculpture
  function createHeroScene() {
    const canvas = document.querySelector("#webgl-canvas");
    if (!canvas || !window.THREE) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 4.8;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x0b0b0b, 1);

    const geometry = new THREE.IcosahedronGeometry(1.55, 5);
    const material = new THREE.ShaderMaterial({
      wireframe: true,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uColor: { value: new THREE.Color(0x0033ff) },
      },
      vertexShader: `
        uniform float uTime;
        uniform vec2 uPointer;
        varying float vWave;
        void main() {
          vec3 p = position;
          float wave = sin(p.y * 3.1 + uTime * 0.8) * 0.08;
          wave += sin(p.x * 4.2 - uTime * 0.55) * 0.045;
          float influence = 1.0 - smoothstep(0.0, 2.2, distance(p.xy, uPointer * 1.3));
          p += normal * (wave + influence * 0.17);
          vWave = wave + influence;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vWave;
        void main() {
          vec3 base = mix(vec3(0.28), uColor, smoothstep(0.02, 0.75, vWave));
          gl_FragColor = vec4(base, 0.55);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.z = -0.18;
    scene.add(mesh);

    const pointsMaterial = new THREE.PointsMaterial({
      color: 0xf9f9f9,
      size: 0.008,
      transparent: true,
      opacity: 0.6,
    });
    const points = new THREE.Points(geometry, pointsMaterial);
    points.scale.setScalar(1.015);
    scene.add(points);

    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    window.addEventListener("pointermove", (event) => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    function resize() {
      const { clientWidth, clientHeight } = canvas;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
      mesh.scale.setScalar(window.innerWidth < 800 ? 0.78 : 1);
      points.scale.setScalar(window.innerWidth < 800 ? 0.79 : 1.015);
    }

    const clock = new THREE.Clock();
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas);

    function render() {
      requestAnimationFrame(render);
      if (!visible) return;

      pointer.x += (target.x - pointer.x) * 0.045;
      pointer.y += (target.y - pointer.y) * 0.045;
      const time = clock.getElapsedTime();
      material.uniforms.uTime.value = reduceMotion ? 0 : time;
      material.uniforms.uPointer.value.set(pointer.x, pointer.y);
      mesh.rotation.y = time * 0.07 + pointer.x * 0.25;
      mesh.rotation.x = pointer.y * 0.18;
      points.rotation.copy(mesh.rotation);
      renderer.render(scene, camera);
    }

    window.addEventListener("resize", resize);
    resize();
    render();
  }

  createHeroScene();
})();
