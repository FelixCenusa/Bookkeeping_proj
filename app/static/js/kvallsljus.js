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
  if (!root.classList.contains("kv-lit")) {
    const indexes = Array.from(document.querySelectorAll(".kv-bulb"), (bulb) => Number(bulb.style.getPropertyValue("--i")) || 0);
    const last = indexes.length ? Math.max(...indexes) : 0;
    window.setTimeout(() => root.classList.add("kv-lit"), reduceMotion.matches ? 0 : 360 + last * 105 + 900);
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
