// Kvällsljus: display-only enhancements for the customer pages.
// Never changes booking logic: it reads the contract's hooks and only dispatches the same
// input/change events a person typing would. Everything here re-runs when guest_home's
// script swaps #availability-results with innerHTML.
(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;

  /* ---------- Festoon: pin the lit state once the string has lit up ---------- */
  // After the last bulb is on, html.kv-lit removes the animation, so a later restyle
  // (resizing across a breakpoint, a re-render) can never replay it.
  const litCallbacks = [];
  const whenLit = (callback) => {
    if (root.classList.contains("kv-lit")) callback();
    else litCallbacks.push(callback);
  };
  if (!root.classList.contains("kv-lit")) {
    const indexes = Array.from(document.querySelectorAll(".kv-bulb"), (bulb) => Number(bulb.style.getPropertyValue("--i")) || 0);
    const last = indexes.length ? Math.max(...indexes) : 0;
    window.setTimeout(() => {
      root.classList.add("kv-lit");
      litCallbacks.splice(0).forEach((callback) => callback());
    }, reduceMotion.matches ? 0 : 360 + last * 105 + 900);
  }

  /* ---------- Motion: hero load-in, scroll reveals, festoon wave ---------- */
  // Uses Motion (motion.dev, vendored in static/js/vendor) when it loaded. Without it, or with reduced motion,
  // everything is simply shown in its final state and the bulbs stay lit.
  const Motion = window.Motion;
  const motionReady = Boolean(Motion && Motion.animate && Motion.inView && Motion.stagger);
  const revealing = motionReady && !reduceMotion.matches && root.classList.contains("kv-motion");
  const easeOut = [0.23, 1, 0.32, 1];

  // Once an element has arrived, drop every inline trace so nothing keeps a transform,
  // will-change or opacity layer (price popovers are position: fixed inside some of them).
  const settle = (el) => {
    el.style.opacity = "";
    el.style.transform = "";
    el.style.willChange = "";
  };
  // Motion writes the final keyframe once more on the frame after `finished`, so clear after that.
  const whenDone = (controls, els) => {
    const done = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => els.forEach(settle)));
    controls.finished.then(done, done);
  };

  // opacity plus a small rise, or opacity only for anything a person may click straight away
  const arrive = (els, { rise = 0, delay = 0, duration = 0.6 } = {}) => {
    const keyframes = rise ? { opacity: [0, 1], transform: [`translateY(${rise}px)`, "translateY(0px)"] } : { opacity: [0, 1] };
    whenDone(Motion.animate(els, keyframes, { duration, delay, ease: easeOut }), els);
  };

  if (revealing) {
    // Hero: heading, lede, then the date panel, within about 0.8 s. The panel only fades, so the
    // date fields sit still and take clicks from the first frame.
    const hero = Array.from(document.querySelectorAll("[data-kv-load]"));
    hero.forEach((el, index) => {
      el.style.opacity = "0";
      const fade = el.dataset.kvLoad === "fade";
      arrive([el], { rise: fade ? 0 : 12, delay: 0.08 + index * 0.09, duration: fade ? 0.5 : 0.6 });
    });

    // Section headings and photos, once each as they scroll into view.
    const singles = Array.from(document.querySelectorAll("[data-reveal]"));
    singles.forEach((el) => {
      el.style.opacity = "0";
    });
    Motion.inView(singles, (el) => {
      arrive([el], { rise: el.dataset.reveal === "fade" ? 0 : 14, duration: el.dataset.reveal === "fade" ? 0.9 : 0.6 });
    }, { margin: "0px 0px -8% 0px" });

    // Lists (the tent menu): items that come into view together fade in one after another.
    // Opacity only, each row holds a price popover.
    const items = Array.from(document.querySelectorAll("[data-reveal-list] > *"));
    items.forEach((el) => {
      el.style.opacity = "0";
    });
    let batch = [];
    const flushBatch = () => {
      const els = batch;
      batch = [];
      whenDone(Motion.animate(els, { opacity: [0, 1] }, { duration: 0.5, delay: Motion.stagger(0.06), ease: easeOut }), els);
    };
    Motion.inView(items, (el) => {
      if (!batch.length) window.requestAnimationFrame(flushBatch);
      batch.push(el);
    }, { margin: "0px 0px -6% 0px" });
  }
  // Inline styles now hold whatever is still waiting, so the class can go. Anything the booking
  // script renders later is never hidden.
  root.classList.remove("kv-motion");

  if (motionReady && !reduceMotion.matches) {
    whenLit(() => {
      const festoons = Array.from(document.querySelectorAll(".kv-festoon"));
      if (!festoons.length) return;
      festoons.forEach((festoon) => {
        festoon.querySelectorAll(".kv-bulb").forEach((bulb) => {
          const flare = document.createElement("b");
          flare.className = "kv-flare";
          bulb.appendChild(flare);
        });
      });

      // A slow wave, left to right: each bulb brightens and settles back. Runs every ~4.5 s,
      // only for strings on screen and only while the tab is visible.
      const WAVE_EVERY = 4500;
      const visible = new Set();
      let timer = 0;
      const stop = () => {
        window.clearTimeout(timer);
        timer = 0;
      };
      const wave = (festoon) => {
        const flares = Array.from(festoon.querySelectorAll(".kv-flare"));
        Motion.animate(flares, { opacity: [0, 0.8, 0] }, {
          duration: 1.2,
          times: [0, 0.3, 1],
          ease: [easeOut, "easeInOut"],
          delay: Motion.stagger(0.05),
        });
      };
      const tick = () => {
        timer = 0;
        if (document.hidden || !visible.size) return;
        visible.forEach(wave);
        timer = window.setTimeout(tick, WAVE_EVERY);
      };
      const start = (after) => {
        if (!timer && !document.hidden && visible.size) timer = window.setTimeout(tick, after);
      };

      Motion.inView(festoons, (festoon) => {
        visible.add(festoon);
        start(1600);
        return () => {
          visible.delete(festoon);
          if (!visible.size) stop();
        };
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else start(1600);
      });
    });
  }

  /* ---------- Mobile menu: close on outside click, Escape and link tap ---------- */
  const menu = document.querySelector("[data-kv-menu]");
  if (menu) {
    document.addEventListener("click", (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    });
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) menu.open = false;
    });
  }

  /* ---------- FAQ: a link to /faq#fraga-3 opens that answer ---------- */
  const openFromHash = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target instanceof HTMLDetailsElement) target.open = true;
  };
  openFromHash();
  window.addEventListener("hashchange", openFromHash);

  /* ---------- Quantity steppers around [data-booking-qty] ---------- */
  const readInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const syncStepper = (wrap) => {
    const input = wrap.querySelector("[data-booking-qty]");
    if (!input) return;
    const value = readInt(input.value, 0);
    const min = readInt(input.min, 0);
    const max = readInt(input.max, Number.MAX_SAFE_INTEGER);
    const down = wrap.querySelector('[data-kv-step="-1"]');
    const up = wrap.querySelector('[data-kv-step="1"]');
    if (down) down.disabled = input.disabled || value <= min;
    if (up) up.disabled = input.disabled || value >= max;
    wrap.classList.toggle("has-qty", !input.disabled && value > 0);
  };

  const syncAllSteppers = (root = document) => {
    root.querySelectorAll("[data-kv-qty]").forEach(syncStepper);
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kv-step]");
    if (!button) return;
    const wrap = button.closest("[data-kv-qty]");
    const input = wrap?.querySelector("[data-booking-qty]");
    if (!input || input.disabled) return;
    const step = readInt(button.dataset.kvStep, 0);
    const min = readInt(input.min, 0);
    const max = readInt(input.max, Number.MAX_SAFE_INTEGER);
    const next = Math.min(Math.max(readInt(input.value, 0) + step, min), max);
    if (String(next) === input.value) return;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // The booking JS mirrors values and rewrites max without events, so resync after any edit.
  const queueStepperSync = () => window.requestAnimationFrame(() => syncAllSteppers());
  document.addEventListener("input", (event) => {
    if (event.target.closest?.("#guest-booking-form")) queueStepperSync();
  });
  document.addEventListener("change", (event) => {
    if (event.target.closest?.("#guest-booking-form")) queueStepperSync();
  });

  /* ---------- Dates bar: day count and "Ändra" ---------- */
  const dayCount = (start, end) => {
    const a = Date.parse(`${start}T00:00:00`);
    const b = Date.parse(`${end}T00:00:00`);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    return Math.round((b - a) / 86400000) + 1;
  };

  const initDatesBar = (root) => {
    root.querySelectorAll("[data-kv-days]").forEach((el) => {
      const days = dayCount(el.dataset.start, el.dataset.end);
      el.textContent = days ? `${days} ${days === 1 ? "dag" : "dagar"}` : "";
      el.hidden = !days;
    });
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-kv-change-dates]");
    if (!link) return;
    const form = document.getElementById("availability-search-form");
    const start = form?.querySelector("[data-date-range-start]");
    if (!form || !start) return;
    event.preventDefault();
    form.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
    window.setTimeout(() => {
      start.focus({ preventScroll: true });
      start._flatpickr?.open();
    }, reduceMotion.matches ? 0 : 450);
  });

  /* ---------- Running total: mobile bar + receipt highlight ---------- */
  let totalObserver = null;
  let receiptObserver = null;

  const initTotals = (root) => {
    totalObserver?.disconnect();
    receiptObserver?.disconnect();
    const form = root.querySelector("#guest-booking-form");
    const total = form?.querySelector("#summary-total");
    const items = form?.querySelector("#summary-items");
    const bar = document.querySelector("[data-kv-totalbar]");
    if (!form || !total) return;

    const barTotal = bar?.querySelector("[data-kv-total]");
    const barItems = bar?.querySelector("[data-kv-items]");
    let last = total.textContent.trim();

    const hasPicks = () => Array.from(form.querySelectorAll("[data-booking-qty]")).some((input) => Number(input.value) > 0);
    let receiptInView = false;
    const syncBar = () => bar?.classList.toggle("is-hidden", receiptInView || !hasPicks());

    const mirror = () => {
      const text = total.textContent.trim();
      if (barTotal) barTotal.textContent = text;
      if (barItems && items) barItems.textContent = items.textContent.trim();
      syncBar();
      if (text !== last) {
        last = text;
        total.classList.add("is-bumped");
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => total.classList.remove("is-bumped"));
        });
      }
    };
    mirror();
    totalObserver = new MutationObserver(mirror);
    totalObserver.observe(total, { childList: true, characterData: true, subtree: true });
    if (items) totalObserver.observe(items, { childList: true, characterData: true, subtree: true });

    const receipt = form.querySelector("[data-kv-receipt]");
    if (bar && receipt && "IntersectionObserver" in window) {
      receiptObserver = new IntersectionObserver(([entry]) => {
        receiptInView = entry.isIntersecting;
        syncBar();
      });
      receiptObserver.observe(receipt);
    }
    syncBar();
  };

  /* ---------- Results swap (AJAX date search) ---------- */
  const onResults = (root, { fromSearch }) => {
    initDatesBar(root);
    syncAllSteppers(root);
    initTotals(root);
    const hasBooking = Boolean(root.querySelector("#guest-booking-form"));
    document.querySelectorAll("[data-kv-landing]").forEach((section) => {
      section.hidden = hasBooking;
    });
    if (fromSearch && hasBooking) {
      root.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    }
  };

  const results = document.getElementById("availability-results");
  if (results) {
    new MutationObserver(() => onResults(results, { fromSearch: true })).observe(results, { childList: true });
  }

  const boot = () => {
    onResults(document, { fromSearch: false });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  // guest_home's own init runs on DOMContentLoaded too and may rewrite max values after us.
  window.addEventListener("load", () => syncAllSteppers());
})();
