// Solsken: display-only behaviour for the customer pages.
// Nothing here touches pricing, availability or form submission. Everything is
// delegated or re-bound on the #availability-results swap, because the results
// partial is inserted with innerHTML and its inline scripts never run.
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------- reveal
  // Section headings get their stripe colour wiped in once, when they enter.
  const wipeObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.4 })
    : null;

  const bindWipes = (scope) => {
    scope.querySelectorAll(".sk-wipe:not(.is-in)").forEach((el) => {
      if (wipeObserver) {
        wipeObserver.observe(el);
      } else {
        el.classList.add("is-in");
      }
    });
  };

  // ---------------------------------------------------------------- motion
  // The page head eases up on load, and tent cards and the furniture list
  // fade in with a small stagger as they scroll into view (Motion, motion.dev).
  // CSS hides [data-reveal] only while html.sk-motion is set; see the head
  // script. Anything that holds a fixed price popover animates opacity only.
  const Motion = window.Motion;
  const EASE_OUT = [0.23, 1, 0.32, 1];
  let revealStops = [];

  const motionReady = () =>
    Boolean(Motion && typeof Motion.animate === "function" && typeof Motion.inView === "function" && typeof Motion.stagger === "function");

  const showEverything = () => root.classList.remove("sk-motion");

  const isRendered = (el) => el.getClientRects().length > 0;

  const loadIn = () => {
    const { animate, stagger } = Motion;
    const items = Array.from(document.querySelectorAll('[data-reveal="load"]'));
    const shown = items.filter(isRendered);
    // Hidden now (the compact hero drops the photo) but may show later.
    items.filter((el) => !shown.includes(el)).forEach((el) => { el.style.opacity = "1"; });

    const photos = shown.filter((el) => el.tagName === "FIGURE");
    const blocks = shown.filter((el) => el.tagName !== "FIGURE");
    if (blocks.length) {
      animate(blocks, { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0px)"] }, {
        duration: 0.5,
        delay: stagger(0.08),
        ease: EASE_OUT,
      });
    }
    if (photos.length) {
      animate(photos, { opacity: [0, 1], transform: ["scale(0.98)", "scale(1)"] }, {
        duration: 0.6,
        delay: stagger(0.08, { startDelay: Math.min(blocks.length, 3) * 0.08 }),
        ease: EASE_OUT,
      });
    }

    // One ambient touch: the hero's scalloped edge settles with a small sway.
    const valance = Array.from(document.querySelectorAll(".sk-hero__photo .sk-valance > span"));
    if (valance.length && isRendered(valance[0])) {
      animate(valance, { transform: ["rotate(-7deg)", "rotate(0deg)"] }, {
        type: "spring",
        bounce: 0.5,
        duration: 0.8,
        delay: stagger(0.012, { startDelay: 0.3 }),
      });
    }
  };

  const bindReveals = (scope) => {
    const { animate, inView, stagger } = Motion;
    const targets = Array.from(scope.querySelectorAll('[data-reveal="scroll"]'));
    if (!targets.length) return;
    let queue = [];
    let queued = false;

    // Everything that enters in the same frame is staggered as one group.
    const flush = () => {
      queued = false;
      const batch = queue;
      queue = [];
      animate(batch, { opacity: [0, 1] }, { duration: 0.45, delay: stagger(0.06), ease: EASE_OUT });
      const canopies = batch.map((el) => el.querySelector(".sk-canopy")).filter(Boolean);
      if (canopies.length) {
        animate(canopies, { transform: ["translateY(14px)", "translateY(0px)"] }, {
          duration: 0.5,
          delay: stagger(0.06),
          ease: EASE_OUT,
        });
      }
    };

    revealStops.push(inView(targets, (el) => {
      queue.push(el);
      if (!queued) {
        queued = true;
        window.requestAnimationFrame(flush);
      }
    }, { amount: 0.2 }));
  };

  const startMotion = () => {
    if (!root.classList.contains("sk-motion")) return;
    if (!motionReady()) {
      showEverything();
      return;
    }
    root.classList.add("sk-motion-on");
    try {
      loadIn();
      bindReveals(document);
    } catch (error) {
      showEverything();
    }
  };

  // ------------------------------------------------------ quantity stepper
  // The +/- buttons drive the real number input and fire the same events a
  // person typing would, so the booking script does all the maths.
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sk-step]");
    if (!button) return;
    const stepper = button.closest("[data-sk-stepper]");
    const input = stepper?.querySelector("input[type='number']");
    if (!input || input.disabled) return;
    event.preventDefault();
    const current = Number.parseInt(input.value || "0", 10) || 0;
    const min = Number.parseInt(input.min || "0", 10) || 0;
    const rawMax = Number.parseInt(input.max || "", 10);
    const max = Number.isFinite(rawMax) ? rawMax : Number.MAX_SAFE_INTEGER;
    const next = button.dataset.skStep === "up" ? Math.min(current + 1, max) : Math.max(current - 1, min);
    if (next === current) return;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const syncSteppers = (scope = document) => {
    scope.querySelectorAll("[data-sk-stepper]").forEach((stepper) => {
      const input = stepper.querySelector("input[type='number']");
      if (!input) return;
      const value = Number.parseInt(input.value || "0", 10) || 0;
      const min = Number.parseInt(input.min || "0", 10) || 0;
      const rawMax = Number.parseInt(input.max || "", 10);
      const down = stepper.querySelector("[data-sk-step='down']");
      const up = stepper.querySelector("[data-sk-step='up']");
      if (down) down.disabled = input.disabled || value <= min;
      if (up) up.disabled = input.disabled || (Number.isFinite(rawMax) && value >= rawMax);
    });
  };

  document.addEventListener("input", (event) => {
    if (event.target.matches?.("[data-booking-qty]")) {
      window.requestAnimationFrame(() => syncSteppers());
    }
  });

  // ----------------------------------------------------- mobile total bar
  let totalCleanup = null;

  const bindMobileTotal = () => {
    if (totalCleanup) totalCleanup();
    totalCleanup = null;

    const bar = document.querySelector("[data-sk-mobiletotal]");
    const total = document.getElementById("summary-total");
    const items = document.getElementById("summary-items");
    const summary = document.getElementById("steg-5");
    if (!bar || !total || !items) return;

    const totalMirror = bar.querySelector("[data-sk-total-mirror]");
    const itemsMirror = bar.querySelector("[data-sk-items-mirror]");
    let summaryBelow = true;

    const render = () => {
      if (totalMirror) totalMirror.textContent = total.textContent.trim();
      if (itemsMirror) itemsMirror.textContent = items.textContent.trim();
      const count = Number.parseInt(items.textContent, 10) || 0;
      bar.classList.toggle("is-visible", count > 0 && summaryBelow);
    };

    const textObserver = new MutationObserver(render);
    textObserver.observe(total, { childList: true, characterData: true, subtree: true });
    textObserver.observe(items, { childList: true, characterData: true, subtree: true });

    let sectionObserver = null;
    if (summary && "IntersectionObserver" in window) {
      sectionObserver = new IntersectionObserver(([entry]) => {
        summaryBelow = !entry.isIntersecting && entry.boundingClientRect.top > 0;
        render();
      });
      sectionObserver.observe(summary);
    }

    render();
    totalCleanup = () => {
      textObserver.disconnect();
      sectionObserver?.disconnect();
    };
  };

  // ---------------------------------------------- open FAQ item from a hash
  const openHashTarget = () => {
    if (!window.location.hash) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target && target.tagName === "DETAILS") target.open = true;
  };

  // ---------------------------------------------------- results swapping
  const onResultsSwapped = (results) => {
    // With dates chosen the hero shrinks to a heading and the date form, so
    // the booking flow starts near the top instead of below the photo.
    document
      .querySelector("[data-sk-hero]")
      ?.classList.toggle("sk-hero--compact", Boolean(results.querySelector("#guest-booking-form")));
    bindWipes(results);
    if (root.classList.contains("sk-motion-on")) {
      revealStops.forEach((stop) => stop());
      revealStops = [];
      try {
        bindReveals(results);
      } catch (error) {
        showEverything();
      }
    }
    syncSteppers(results);
    bindMobileTotal();
    const top = results.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.6 && results.querySelector("#guest-booking-form")) {
      const navOffset = parseFloat(getComputedStyle(root).getPropertyValue("--sk-nav-h")) || 72;
      window.scrollTo({
        top: window.scrollY + top - navOffset,
        behavior: reduceMotion.matches ? "auto" : "smooth",
      });
    }
  };

  const boot = () => {
    startMotion();
    bindWipes(document);
    syncSteppers();
    bindMobileTotal();
    openHashTarget();

    const results = document.getElementById("availability-results");
    if (results) {
      new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "childList" && m.addedNodes.length)) {
          onResultsSwapped(results);
        }
      }).observe(results, { childList: true });
    }

    // The booking script clamps quantities after it initialises; mirror that.
    window.addEventListener("load", () => syncSteppers(), { once: true });
  };

  window.addEventListener("hashchange", openHashTarget);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
