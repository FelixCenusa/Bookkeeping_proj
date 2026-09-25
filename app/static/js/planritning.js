/*
  Planritning: customer-side enhancements.

  Everything here is progressive: the pages work and read correctly without it.
  No scroll listeners; visibility work goes through IntersectionObserver.
  The booking partial is swapped in with innerHTML after a date search, so every
  init function is idempotent and runs again after that swap.
*/
(function () {
  "use strict";

  window.__prReady = true;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hasIO = "IntersectionObserver" in window;

  function each(root, selector, fn) {
    Array.prototype.forEach.call(root.querySelectorAll(selector), fn);
  }

  function once(el, key) {
    if (el.dataset[key] === "1") return false;
    el.dataset[key] = "1";
    return true;
  }

  /* ---------- Footprint draw-in ---------- */

  var drawObserver = hasIO
    ? new IntersectionObserver(
        function (entries) {
          var batch = entries.filter(function (entry) {
            return entry.isIntersecting;
          });
          batch.forEach(function (entry, index) {
            var svg = entry.target;
            // Drawings that enter together draw in a short left-to-right sequence.
            svg.style.setProperty("--fp-delay", Math.min(index, 5) * 70 + "ms");
            svg.classList.add("is-drawn");
            drawObserver.unobserve(svg);
          });
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.35 }
      )
    : null;

  function initFootprints(root) {
    each(root, "svg[data-fp-draw]", function (svg) {
      if (!once(svg, "fpInit")) return;
      if (!drawObserver || reduceMotion.matches) {
        svg.classList.add("is-drawn");
        return;
      }
      drawObserver.observe(svg);
    });
  }

  /* ---------- Plan sheet: guests to tent size ---------- */

  function initPlanSheet(root) {
    each(root, "[data-plan-sheet]", function (sheet) {
      if (!once(sheet, "psInit")) return;

      var range = sheet.querySelector("[data-ps-range]");
      var count = sheet.querySelector("[data-ps-count]");
      var tents = Array.prototype.slice.call(sheet.querySelectorAll("[data-ps-tent]"));
      var results = Array.prototype.slice.call(sheet.querySelectorAll("[data-ps-result]"));
      if (!range || !tents.length) return;

      var settle = function () {
        sheet.classList.add("is-settled");
      };

      var select = function (guests) {
        // Tents are listed smallest first, so the first one that fits is the answer.
        var pick = null;
        for (var i = 0; i < tents.length; i += 1) {
          if (Number(tents[i].dataset.capacity || 0) >= guests) {
            pick = tents[i];
            break;
          }
        }
        if (!pick) pick = tents[tents.length - 1];
        var id = pick.dataset.psTent;
        tents.forEach(function (tent) {
          tent.classList.toggle("is-on", tent === pick);
        });
        results.forEach(function (result) {
          result.classList.toggle("is-on", result.dataset.psResult === id);
        });
        if (count) count.textContent = String(guests);
      };

      range.addEventListener("input", function () {
        settle();
        select(Number(range.value) || 1);
      });

      if (!hasIO || reduceMotion.matches) {
        sheet.classList.add("is-drawn");
        settle();
        return;
      }

      var sheetObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            sheet.classList.add("is-drawn");
            sheetObserver.disconnect();
            // Hand the highlighted tent back to plain class toggling once the sequence has played.
            window.setTimeout(settle, 1700);
          });
        },
        { threshold: 0.3 }
      );
      sheetObserver.observe(sheet);
    });
  }

  /* ---------- Quantity steppers ---------- */

  function stepperInput(button) {
    var ctl = button.closest(".pr-qty__ctl");
    return ctl ? ctl.querySelector("input") : null;
  }

  function syncStepper(input) {
    var ctl = input.closest(".pr-qty__ctl");
    if (!ctl) return;
    var value = parseInt(input.value || "0", 10) || 0;
    var min = input.min === "" ? 0 : Number(input.min);
    var max = input.max === "" ? Infinity : Number(input.max);
    each(ctl, "[data-qty-step]", function (button) {
      var step = Number(button.dataset.qtyStep);
      button.disabled = input.disabled || (step < 0 ? value <= min : value >= max);
    });
  }

  function syncAllSteppers(root) {
    each(root || document, ".pr-qty__ctl input", syncStepper);
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-qty-step]");
    if (!button || button.disabled) return;
    var input = stepperInput(button);
    if (!input || input.disabled) return;
    var value = parseInt(input.value || "0", 10) || 0;
    var min = input.min === "" ? 0 : Number(input.min);
    var max = input.max === "" ? Infinity : Number(input.max);
    var next = Math.min(max, Math.max(min, value + Number(button.dataset.qtyStep)));
    if (next === value) return;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // The booking script mirrors each quantity into its paired card or row without
  // firing events, so refresh every stepper after any quantity change.
  document.addEventListener(
    "input",
    function (event) {
      if (event.target.matches && event.target.matches("[data-booking-qty]")) {
        window.requestAnimationFrame(function () {
          syncAllSteppers(document);
        });
      }
    },
    true
  );

  /* ---------- Booking flow: progress, total, mobile bar ---------- */

  function initFlow(root) {
    each(root, "[data-pr-flow]", function (flow) {
      if (!once(flow, "flowInit")) return;

      var steps = Array.prototype.slice.call(flow.querySelectorAll("[data-pr-step]"));
      var sections = Array.prototype.slice.call(flow.querySelectorAll("[data-pr-step-section]"));
      var total = flow.querySelector("#summary-total");
      var ticker = flow.querySelector("[data-total-ticker]");
      var mirror = flow.querySelector("[data-pr-mirror-total]");
      var bar = flow.querySelector("[data-pr-mobilebar]");
      var summary = flow.querySelector("#steg-5");

      syncAllSteppers(flow);

      /* Current step follows the section in the middle of the screen. */
      var setCurrent = function (n) {
        steps.forEach(function (step) {
          var k = Number(step.dataset.prStep);
          var link = step.querySelector("a");
          step.classList.toggle("is-done", k < n);
          step.classList.toggle("is-current", k === n);
          if (link) {
            if (k === n) link.setAttribute("aria-current", "step");
            else link.removeAttribute("aria-current");
          }
        });
      };

      if (hasIO && sections.length) {
        var visible = new Map();
        var stepObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              visible.set(entry.target, entry.isIntersecting);
            });
            // Lowest visible step wins: on wide screens the summary (step 5) sits in a
            // sticky side column and is always on screen.
            var current = null;
            sections.forEach(function (section) {
              var n = Number(section.dataset.prStepSection);
              if (visible.get(section) && (current === null || n < current)) current = n;
            });
            if (current) setCurrent(current);
          },
          { rootMargin: "-35% 0px -60% 0px" }
        );
        sections.forEach(function (section) {
          stepObserver.observe(section);
        });
      }

      /* Total: the real value stays in #summary-total for the booking script and
         screen readers; a mirror counts to each new value. */
      var formatLike = function (value) {
        return Math.round(value).toLocaleString("sv-SE") + " kr";
      };
      var parseMoney = function (text) {
        var cleaned = String(text || "")
          .replace(/[^\d,.-]/g, "")
          .replace(",", ".");
        var number = parseFloat(cleaned);
        return Number.isFinite(number) ? number : 0;
      };

      if (total && ticker) {
        var shown = parseMoney(total.textContent);
        var frame = 0;
        ticker.textContent = total.textContent;
        ticker.hidden = false;
        total.classList.add("pr-sr");

        var render = function () {
          var text = total.textContent;
          if (mirror) mirror.textContent = text;
          var target = parseMoney(text);
          window.cancelAnimationFrame(frame);
          if (reduceMotion.matches || target === shown) {
            shown = target;
            ticker.textContent = text;
            return;
          }
          var from = shown;
          var start = performance.now();
          var duration = 280;
          var tick = function (now) {
            var t = Math.min(1, (now - start) / duration);
            var eased = 1 - Math.pow(1 - t, 3);
            shown = from + (target - from) * eased;
            ticker.textContent = t < 1 ? formatLike(shown) : text;
            if (t < 1) frame = window.requestAnimationFrame(tick);
            else shown = target;
          };
          frame = window.requestAnimationFrame(tick);
        };

        new MutationObserver(render).observe(total, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        if (mirror) mirror.textContent = total.textContent;
      }

      /* Mobile total bar steps aside while the summary is on screen or behind us. */
      if (bar && summary && hasIO) {
        var barObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            var passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
            bar.classList.toggle("is-away", entry.isIntersecting || passed);
          });
        });
        barObserver.observe(summary);
      }
    });
  }

  /* "Ändra" in the progress bar: back to the date fields. */
  document.addEventListener("click", function (event) {
    var edit = event.target.closest("[data-pr-edit-dates]");
    if (!edit) return;
    var form = document.getElementById("availability-search-form");
    var start = document.getElementById("start_date");
    if (!form) return;
    form.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
    if (start) {
      window.setTimeout(
        function () {
          start.focus({ preventScroll: true });
          if (start._flatpickr) start._flatpickr.open();
        },
        reduceMotion.matches ? 0 : 380
      );
    }
  });

  /* ---------- Navigation menu ---------- */

  function initMenu(root) {
    each(root, "[data-pr-menu]", function (menu) {
      if (!once(menu, "menuInit")) return;
      var toggle = menu.querySelector("summary");
      var syncLabel = function () {
        if (toggle) toggle.setAttribute("aria-label", menu.open ? "Stäng menyn" : "Öppna menyn");
      };
      menu.addEventListener("toggle", syncLabel);
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && menu.open) {
          menu.open = false;
          if (toggle) toggle.focus();
        }
      });
      document.addEventListener("click", function (event) {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
      });
    });
  }

  /* ---------- Boot, and re-boot after the availability swap ---------- */

  function init(root) {
    initFootprints(root);
    initPlanSheet(root);
    initFlow(root);
    initMenu(root);
  }

  function boot() {
    document.documentElement.classList.add("pr-js");
    init(document);

    var results = document.getElementById("availability-results");
    if (!results) return;
    new MutationObserver(function (records) {
      var swapped = records.some(function (record) {
        return record.addedNodes.length > 0;
      });
      if (!swapped) return;
      init(results);
      var flow = results.querySelector("[data-pr-flow]");
      if (flow) {
        flow.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
      }
    }).observe(results, { childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
