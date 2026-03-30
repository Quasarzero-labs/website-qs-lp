import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const header = document.querySelector(".site-header");
const toggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const pricingGrid = document.querySelector("#pricing-grid");
const internalLinks = document.querySelectorAll('a[href^="#"]');
const caseTrack = document.querySelector(".case-track");
const caseGrid = document.querySelector(".case-grid");
const caseScrollbar = document.querySelector("#case-scrollbar");
const caseArrowPrev = document.querySelector(".case-arrow-prev");
const caseArrowNext = document.querySelector(".case-arrow-next");
const locale = pricingGrid?.dataset.locale || document.documentElement.lang || "fr";

const lenis = new Lenis({
  duration: 1.15,
  smoothWheel: true,
});

lenis.on("scroll", ScrollTrigger.update);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});

gsap.ticker.lagSmoothing(0);

if (toggle && header) {
  toggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    header?.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
  });
});

internalLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;

    const target = document.querySelector(href);
    if (!target) return;

    event.preventDefault();

    const headerOffset = header ? header.offsetHeight + 20 : 20;
    lenis.scrollTo(target, {
      offset: -headerOffset,
      duration: 1.2,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  });
});

function createPricingCard(offer, featured) {
  const article = document.createElement("article");
  article.className = `pricing-card reveal${featured ? " pricing-card-featured" : ""}`;

  const kicker = document.createElement("p");
  kicker.className = "pricing-kicker";
  kicker.textContent = offer.name;

  const title = document.createElement("h3");
  title.textContent = offer.subtitle;

  const desc = document.createElement("p");
  desc.className = "pricing-text";
  desc.textContent = offer.description;

  const priceBlock = document.createElement("div");
  priceBlock.className = "price-block";

  const priceSpan = document.createElement("span");
  priceSpan.className = "price";

  const raw = offer.price;
  const prefixMap = { "Dès ": "Dès", "From ": "From" };
  const matchedPrefix = Object.keys(prefixMap).find((p) => raw.startsWith(p));
  if (matchedPrefix) {
    const prefixEl = document.createElement("span");
    prefixEl.className = "price-prefix";
    prefixEl.textContent = prefixMap[matchedPrefix];
    const valueEl = document.createElement("span");
    valueEl.className = "price-value";
    valueEl.textContent = raw.slice(matchedPrefix.length);
    priceSpan.append(prefixEl, valueEl);
  } else {
    const valueEl = document.createElement("span");
    valueEl.className = "price-value";
    valueEl.textContent = raw;
    priceSpan.append(valueEl);
  }

  const durationSpan = document.createElement("span");
  durationSpan.className = "price-note-inline";
  durationSpan.textContent = offer.duration || "";

  priceBlock.append(priceSpan, durationSpan);

  const badge = document.createElement("span");
  badge.className = "pricing-badge";
  badge.textContent = locale.startsWith("en") ? "Included" : "Inclus";

  const ul = document.createElement("ul");
  offer.features.forEach((feature) => {
    const li = document.createElement("li");
    li.textContent = feature;
    ul.append(li);
  });

  article.append(kicker, title, desc, priceBlock, badge, ul);
  return article;
}

async function loadPricing() {
  if (!pricingGrid) return;

  try {
    const source = pricingGrid.dataset.source || "data/offers.json";
    const response = await fetch(source);
    if (!response.ok) throw new Error("Pricing data unavailable");

    const offers = await response.json();
    pricingGrid.replaceChildren(
      ...offers.map((offer, index) => createPricingCard(offer, index === 1))
    );

    initRevealAnimations();
  } catch (error) {
    pricingGrid.innerHTML = locale.startsWith("en")
      ? "<p>Unable to load pricing at the moment.</p>"
      : "<p>Impossible de charger les offres pour le moment.</p>";
  }
}

function initHeroMotion() {
  const heroTitle = document.querySelector(".hero-copy h1");
  const heroKicker = document.querySelector(".hero-kicker");
  const stats = document.querySelectorAll(".panel-grid article");
  const heroText = document.querySelector(".panel-card p");

  if (!heroTitle) return;

  gsap.set([heroKicker, heroTitle, stats, heroText], { autoAlpha: 0, y: 40 });

  gsap
    .timeline({ defaults: { ease: "power3.out" } })
    .to(heroKicker, { autoAlpha: 1, y: 0, duration: 0.55 })
    .to(heroTitle, { autoAlpha: 1, y: 0, duration: 0.9, clearProps: "y" }, "-=0.2")
    .to(stats, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.65 }, "-=0.4")
    .to(heroText, { autoAlpha: 1, y: 0, duration: 0.7 }, "-=0.35");

  gsap.to(heroTitle, {
    yPercent: 12,
    ease: "none",
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: 0.8,
    },
  });

  gsap.to(".hero-panel", {
    yPercent: -8,
    ease: "none",
    scrollTrigger: {
      trigger: ".hero",
      start: "top bottom",
      end: "bottom top",
      scrub: 1,
    },
  });
}

function initHeroCanvas() {
  if (window.matchMedia("(max-width: 760px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const heroCopy = document.querySelector(".hero-copy");
  if (!heroCopy) return;

  const canvas = document.createElement("canvas");
  canvas.className = "hero-canvas";
  heroCopy.prepend(canvas);

  const ctx = canvas.getContext("2d");
  let rafId = null;
  let active = true;
  let prev = 0;

  function resize() {
    const w = heroCopy.offsetWidth || window.innerWidth * 0.65;
    const h = heroCopy.offsetHeight || window.innerHeight * 0.38;
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    trees = [];
    spawnTree();
    spawnTree();
  }

  function sampleK() {
    const r = Math.random();
    if (r < 0.20) return 0;
    if (r < 0.62) return 1;
    if (r < 0.90) return 2;
    return 3;
  }

  function buildTree() {
    const MAX_GEN = 7;
    const ox = canvas.width * (0.08 + Math.random() * 0.74);
    const oy = canvas.height * (0.82 + Math.random() * 0.14);
    const edges = [];

    function branch(x, y, angle, gen) {
      if (gen >= MAX_GEN || edges.length > 150) return;
      const k = sampleK();
      for (let i = 0; i < k; i++) {
        const spread = Math.max(0.28, 0.82 - gen * 0.07);
        const a = angle + (Math.random() - 0.5) * spread;
        const len = canvas.height * 0.15 * Math.pow(0.70, gen) * (0.7 + Math.random() * 0.6);
        const nx = x + Math.cos(a) * len;
        const ny = y + Math.sin(a) * len;
        edges.push({ x0: x, y0: y, x1: nx, y1: ny, gen });
        branch(nx, ny, a, gen + 1);
      }
    }

    branch(ox, oy, -Math.PI / 2 + (Math.random() - 0.5) * 0.28, 0);
    const maxGen = edges.length ? Math.max(...edges.map((e) => e.gen)) : 0;
    return { edges, maxGen, progress: 0, fadeOut: 1 };
  }

  let trees = [];

  function spawnTree() {
    trees.push(buildTree());
  }

  const GROW = 0.00032;
  const FADE = 0.00055;

  function tick(ts) {
    if (!active) return;
    const dt = Math.min(ts - prev, 50);
    prev = ts;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    trees = trees.filter((t) => t.fadeOut > 0);

    for (const tree of trees) {
      if (tree.progress < 1) {
        tree.progress = Math.min(1, tree.progress + GROW * dt);
      } else {
        tree.fadeOut = Math.max(0, tree.fadeOut - FADE * dt);
      }

      const span = (tree.maxGen + 1) || 1;
      for (const e of tree.edges) {
        const p = Math.max(0, Math.min(1, (tree.progress - e.gen / span) / (1 / span)));
        if (p <= 0) continue;
        ctx.globalAlpha = 0.28 * (1 - (e.gen / span) * 0.5) * tree.fadeOut;
        ctx.lineWidth = Math.max(0.4, 1.5 - e.gen * 0.17);
        ctx.strokeStyle = "#111";
        ctx.beginPath();
        ctx.moveTo(e.x0, e.y0);
        ctx.lineTo(e.x0 + (e.x1 - e.x0) * p, e.y0 + (e.y1 - e.y0) * p);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    if (trees.length < 2) spawnTree();

    rafId = requestAnimationFrame(tick);
  }

  resize();
  document.fonts.ready.then(resize);
  window.addEventListener("resize", resize, { passive: true });
  rafId = requestAnimationFrame(tick);

  const observer = new IntersectionObserver(
    (entries) => {
      active = entries[0].isIntersecting;
      if (active) {
        prev = performance.now();
        rafId = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(rafId);
      }
    },
    { threshold: 0 }
  );
  observer.observe(heroCopy);
}

function initRevealAnimations() {
  const revealItems = gsap.utils.toArray(".reveal");

  revealItems.forEach((item) => {
    if (item.dataset.animated === "true") return;
    item.dataset.animated = "true";

    gsap.set(item, { autoAlpha: 0, y: 36 });
    gsap.to(item, {
      autoAlpha: 1,
      y: 0,
      duration: 0.8,
      ease: "power3.out",
      scrollTrigger: {
        trigger: item,
        start: "top 88%",
      },
    });
  });

  gsap.utils.toArray(".card").forEach((card) => {
    gsap.to(card, {
      yPercent: -4,
      ease: "none",
      scrollTrigger: {
        trigger: card,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.9,
      },
    });
  });

  gsap.utils.toArray(".step").forEach((step, index) => {
    gsap.fromTo(
      step,
      { x: index % 2 === 0 ? 30 : -30 },
      {
        x: 0,
        ease: "power2.out",
        scrollTrigger: {
          trigger: step,
          start: "top 82%",
        },
      }
    );
  });

  gsap.utils.toArray(".about-copy-block").forEach((block, index) => {
    gsap.fromTo(
      block,
      { y: 32, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 0.85,
        ease: "power3.out",
        scrollTrigger: {
          trigger: block,
          start: "top 86%",
        },
        delay: index * 0.08,
      }
    );
  });
}

function initFooterMotion() {
  const footerTitle = document.querySelector(".footer-center h2");
  if (!footerTitle) return;

  gsap.fromTo(
    footerTitle,
    { scale: 0.92, autoAlpha: 0.4 },
    {
      scale: 1,
      autoAlpha: 1,
      ease: "power2.out",
      scrollTrigger: {
        trigger: ".site-footer",
        start: "top 80%",
        end: "top 45%",
        scrub: 0.8,
      },
    }
  );
}

function initCaseStudiesMotion() {
  if (!caseTrack || !caseGrid || !caseScrollbar) return;

  let draggingScrollbar = false;

  const getMax = () => caseTrack.scrollWidth - caseTrack.clientWidth;

  const syncAll = () => {
    const max = getMax();
    if (max <= 0) {
      caseScrollbar.value = "0";
      caseScrollbar.disabled = true;
      if (caseArrowPrev) caseArrowPrev.disabled = true;
      if (caseArrowNext) caseArrowNext.disabled = true;
      return;
    }
    caseScrollbar.disabled = false;
    const pos = caseTrack.scrollLeft;
    caseScrollbar.value = String(Math.round((pos / max) * 100));
    if (caseArrowPrev) caseArrowPrev.disabled = pos <= 0;
    if (caseArrowNext) caseArrowNext.disabled = pos >= max - 1;
  };

  // track → scrollbar + arrows (skip while user drags the scrollbar thumb)
  caseTrack.addEventListener("scroll", () => {
    if (!draggingScrollbar) syncAll();
  }, { passive: true });

  // scrollbar → track + arrows
  caseScrollbar.addEventListener("input", () => {
    const max = getMax();
    if (max <= 0) return;
    caseTrack.scrollLeft = (Number(caseScrollbar.value) / 100) * max;
    if (caseArrowPrev) caseArrowPrev.disabled = caseTrack.scrollLeft <= 0;
    if (caseArrowNext) caseArrowNext.disabled = caseTrack.scrollLeft >= max - 1;
  });

  caseScrollbar.addEventListener("pointerdown", () => { draggingScrollbar = true; });
  caseScrollbar.addEventListener("pointerup",   () => { draggingScrollbar = false; syncAll(); });
  caseScrollbar.addEventListener("pointercancel", () => { draggingScrollbar = false; });

  // arrows → track (scrollbar follows via scroll event)
  if (caseArrowPrev) {
    caseArrowPrev.addEventListener("click", () => {
      caseTrack.scrollLeft -= caseTrack.clientWidth * 0.75;
    });
  }
  if (caseArrowNext) {
    caseArrowNext.addEventListener("click", () => {
      caseTrack.scrollLeft += caseTrack.clientWidth * 0.75;
    });
  }

  window.addEventListener("resize", syncAll);
  syncAll();
}

initHeroMotion();
initHeroCanvas();
initRevealAnimations();
initFooterMotion();
initCaseStudiesMotion();
loadPricing();
