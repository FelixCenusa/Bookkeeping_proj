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
