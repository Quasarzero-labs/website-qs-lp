import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const header = document.querySelector(".site-header");
const toggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const pricingGrid = document.querySelector("#pricing-grid");
const internalLinks = document.querySelectorAll('a[href^="#"]');
const caseStudiesSection = document.querySelector(".case-studies");
const caseTrack = document.querySelector(".case-track");
const caseGrid = document.querySelector(".case-grid");
const caseScrollbar = document.querySelector("#case-scrollbar");
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

  const items = offer.features
    .map((feature) => `<li>${feature}</li>`)
    .join("");

  let formattedPrice = `<span class="price-value">${offer.price}</span>`;

  if (offer.price.startsWith("Dès ")) {
    formattedPrice = `<span class="price-prefix">Dès</span><span class="price-value">${offer.price.replace("Dès ", "")}</span>`;
  }

  if (offer.price.startsWith("From ")) {
    formattedPrice = `<span class="price-prefix">From</span><span class="price-value">${offer.price.replace("From ", "")}</span>`;
  }

  const includedLabel = locale.startsWith("en") ? "Included" : "Inclus";

  article.innerHTML = `
    <p class="pricing-kicker">${offer.name}</p>
    <h3>${offer.subtitle}</h3>
    <p class="pricing-text">${offer.description}</p>
    <div class="price-block">
      <span class="price">${formattedPrice}</span>
      <span class="price-note-inline">${offer.duration || ""}</span>
    </div>
    <span class="pricing-badge">${includedLabel}</span>
    <ul>${items}</ul>
  `;

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
    .to(heroTitle, { autoAlpha: 1, y: 0, duration: 0.9 }, "-=0.2")
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

  const syncScrollbarFromTrack = () => {
    const maxScroll = caseTrack.scrollWidth - caseTrack.clientWidth;
    if (maxScroll <= 0) {
      caseScrollbar.value = "0";
      caseScrollbar.disabled = true;
      return;
    }

    caseScrollbar.disabled = false;
    const ratio = (caseTrack.scrollLeft / maxScroll) * 100;
    caseScrollbar.value = String(Math.round(ratio));
  };

  const syncTrackFromScrollbar = () => {
    const maxScroll = caseTrack.scrollWidth - caseTrack.clientWidth;
    if (maxScroll <= 0) return;

    const ratio = Number(caseScrollbar.value) / 100;
    caseTrack.scrollTo({
      left: ratio * maxScroll,
      behavior: "smooth",
    });
  };

  syncScrollbarFromTrack();
  caseTrack.addEventListener("scroll", syncScrollbarFromTrack, { passive: true });
  caseScrollbar.addEventListener("input", syncTrackFromScrollbar);
  window.addEventListener("resize", syncScrollbarFromTrack);
}

initHeroMotion();
initRevealAnimations();
initFooterMotion();
initCaseStudiesMotion();
loadPricing();
