(function () {
  var header = document.querySelector(".site-header");
  if (!header) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var chromeSections = Array.prototype.slice.call(document.querySelectorAll("[data-chrome]")).filter(function (el) {
    return el !== header;
  });

  function updateHeader() {
    header.classList.toggle("is-scrolled", window.scrollY > 40);

    var probe = header.offsetHeight / 2;
    for (var i = chromeSections.length - 1; i >= 0; i--) {
      var rect = chromeSections[i].getBoundingClientRect();
      if (rect.top <= probe && rect.bottom > probe) {
        header.setAttribute("data-chrome", chromeSections[i].getAttribute("data-chrome"));
        break;
      }
    }
  }

  window.addEventListener("scroll", updateHeader, { passive: true });
  window.addEventListener("resize", updateHeader);
  updateHeader();

  var toggle = document.querySelector(".site-menu-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
    });
    nav.addEventListener("click", function (event) {
      if (event.target.tagName === "A" && nav.classList.contains("is-open")) {
        toggle.click();
      }
    });
  }

  function countUp(el) {
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    if (reduceMotion) {
      el.textContent = target;
      return;
    }
    var start = null;
    var duration = 1400;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // On wide screens every screen stacks in a sticky centre column and follows
  // the text being read; on narrow screens each returns to its own text.
  var stack = document.querySelector(".journey-stack");
  var steps = Array.prototype.slice.call(document.querySelectorAll(".steps .step"));
  var wide = window.matchMedia("(min-width: 1081px)");

  function replay(panel) {
    if (!panel) return;
    panel.classList.remove("is-visible");
    void panel.offsetWidth;
    panel.classList.add("is-visible");
  }

  function activate(index) {
    if (!stack) return;
    Array.prototype.forEach.call(stack.querySelectorAll(".step-media"), function (media) {
      var on = Number(media.getAttribute("data-step")) === index;
      if (on && !media.classList.contains("is-active")) replay(media.querySelector(".panel"));
      media.classList.toggle("is-active", on);
    });
  }

  function layoutJourney() {
    if (!stack || !steps.length) return;
    if (wide.matches) {
      steps.forEach(function (step) {
        var media = step.querySelector(".step-media");
        if (media) stack.appendChild(media);
      });
      activate(0);
    } else {
      Array.prototype.forEach.call(stack.querySelectorAll(".step-media"), function (media) {
        var step = steps[Number(media.getAttribute("data-step"))];
        media.classList.remove("is-active");
        if (step) step.insertBefore(media, step.firstChild);
      });
    }
  }

  layoutJourney();
  if (wide.addEventListener) wide.addEventListener("change", layoutJourney);

  // the texts sit two to a row, so which one is "in view" cannot pick the
  // screen: the centre follows how far the section itself has been read.
  var grid = document.querySelector(".journey-grid");

  function syncScreen() {
    if (!stack || !grid || !steps.length || !wide.matches) return;
    var box = grid.getBoundingClientRect();
    if (!box.height) return;
    var read = (window.innerHeight * 0.55 - box.top) / box.height;
    var index = Math.floor(read * steps.length);
    if (index < 0) index = 0;
    if (index > steps.length - 1) index = steps.length - 1;
    activate(index);
  }

  window.addEventListener("scroll", syncScreen, { passive: true });
  window.addEventListener("resize", syncScreen);
  syncScreen();

  // <details> snaps open. Drive the height ourselves so a service unfolds.
  Array.prototype.forEach.call(document.querySelectorAll(".svc"), function (svc) {
    var summary = svc.querySelector("summary");
    var body = svc.querySelector(".svc-body");
    if (!summary || !body) return;

    summary.addEventListener("click", function (event) {
      if (reduceMotion) return;
      event.preventDefault();
      if (svc.dataset.busy === "1") return;
      svc.dataset.busy = "1";

      var closing = svc.open;
      if (!closing) svc.open = true;

      var full = body.scrollHeight;
      body.style.height = (closing ? full : 0) + "px";
      void body.offsetHeight; // flush, or both heights land in one frame
      body.style.height = (closing ? 0 : full) + "px";

      var done = function () {
        body.removeEventListener("transitionend", done);
        body.style.height = "";
        if (closing) svc.open = false;
        svc.dataset.busy = "0";
      };
      body.addEventListener("transitionend", done);
      setTimeout(done, 600);
    });
  });

  var targets = document.querySelectorAll(".reveal, .panel");
  if (!("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add("is-visible");
      Array.prototype.forEach.call(el.querySelectorAll("[data-count]"), countUp);
    });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      Array.prototype.forEach.call(entry.target.querySelectorAll("[data-count]"), function (el) {
        setTimeout(function () { countUp(el); }, 500);
      });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -5% 0px" });

  Array.prototype.forEach.call(targets, function (el) {
    observer.observe(el);
  });
})();
