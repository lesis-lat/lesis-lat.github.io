(function () {
  var header = document.querySelector(".site-header");
  if (!header) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var exploreLink = document.querySelector('.hero-actions a[href="#how"]');
  var technicalWork = document.getElementById("how");
  if (exploreLink && technicalWork) {
    var scrollFrame = null;
    function stopExploreScroll() {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
      ["wheel", "touchstart", "pointerdown", "keydown"].forEach(function (type) {
        window.removeEventListener(type, stopExploreScroll);
      });
    }
    exploreLink.addEventListener("click", function (event) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      stopExploreScroll();
      var startY = window.scrollY;
      var endY = Math.max(0, Math.min(
        startY + technicalWork.getBoundingClientRect().top - header.offsetHeight,
        document.documentElement.scrollHeight - window.innerHeight
      ));
      var startTime = null;
      var duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1400;
      function scrollStep(time) {
        if (startTime === null) startTime = time;
        var progress = duration ? Math.min((time - startTime) / duration, 1) : 1;
        var eased = (1 - Math.cos(Math.PI * progress)) / 2;
        window.scrollTo({ top: startY + (endY - startY) * eased, behavior: "instant" });
        if (progress < 1) {
          scrollFrame = requestAnimationFrame(scrollStep);
        } else {
          stopExploreScroll();
          if (window.location.hash !== "#how") window.history.pushState(null, "", "#how");
          technicalWork.setAttribute("tabindex", "-1");
          technicalWork.focus({ preventScroll: true });
          technicalWork.addEventListener("blur", function () {
            technicalWork.removeAttribute("tabindex");
          }, { once: true });
        }
      }
      ["wheel", "touchstart", "pointerdown", "keydown"].forEach(function (type) {
        window.addEventListener(type, stopExploreScroll, { passive: true });
      });
      scrollFrame = requestAnimationFrame(scrollStep);
    });
  }
  var chromeSections = Array.prototype.slice.call(document.querySelectorAll("[data-chrome]")).filter(function (el) {
    return el !== header;
  });

  function updateHeader() {
    var probe = header.offsetHeight / 2;
    var chrome = null;
    for (var i = chromeSections.length - 1; i >= 0; i--) {
      var rect = chromeSections[i].getBoundingClientRect();
      if (rect.top <= probe && rect.bottom > probe) {
        chrome = chromeSections[i].getAttribute("data-chrome");
        break;
      }
    }

    header.classList.toggle("is-scrolled", window.scrollY > 40);
    if (chrome && header.getAttribute("data-chrome") !== chrome) header.setAttribute("data-chrome", chrome);
  }

  var headerFrame = null;
  function scheduleHeader() {
    if (headerFrame !== null) return;
    headerFrame = requestAnimationFrame(function () {
      headerFrame = null;
      updateHeader();
    });
  }

  window.addEventListener("scroll", scheduleHeader, { passive: true });
  window.addEventListener("resize", scheduleHeader);
  scheduleHeader();

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

  var stack = document.querySelector(".journey-stack");
  var steps = Array.prototype.slice.call(document.querySelectorAll(".steps .step"));
  var wide = window.matchMedia("(min-width: 1081px)");

  var activeStep = -1;
  var journeyFrame = null;

  function activate(index) {
    if (!stack || index === activeStep) return;
    activeStep = index;
    Array.prototype.forEach.call(stack.querySelectorAll(".step-media"), function (media) {
      var mediaIndex = Number(media.getAttribute("data-step"));
      var on = mediaIndex === index;
      var panel = media.querySelector(".panel");
      if (on && panel) panel.classList.add("is-visible");
      media.classList.toggle("is-past", mediaIndex < index);
      media.classList.toggle("is-active", on);
    });
    steps.forEach(function (step, stepIndex) {
      step.classList.toggle("is-current", stepIndex === index);
    });
  }

  function layoutJourney() {
    if (!stack || !steps.length) return;
    activeStep = -1;
    if (wide.matches) {
      steps.forEach(function (step) {
        var media = step.querySelector(".step-media");
        if (media) stack.appendChild(media);
      });
      syncScreen();
    } else {
      Array.prototype.forEach.call(stack.querySelectorAll(".step-media"), function (media) {
        var step = steps[Number(media.getAttribute("data-step"))];
        media.classList.remove("is-active");
        media.classList.remove("is-past");
        if (step) step.insertBefore(media, step.firstChild);
      });
      steps.forEach(function (step) { step.classList.remove("is-current"); });
    }
  }

  var grid = document.querySelector(".journey-grid");

  function syncScreen() {
    if (!stack || !grid || !steps.length || !wide.matches) return;
    var box = grid.getBoundingClientRect();
    if (!box.height) return;
    var read = (window.innerHeight * 0.55 - box.top) / box.height;
    var position = read * steps.length;
    if (activeStep >= 0 && position >= activeStep - 0.08 && position < activeStep + 1.08) return;
    var index = Math.floor(position);
    if (index < 0) index = 0;
    if (index > steps.length - 1) index = steps.length - 1;
    activate(index);
  }

  function scheduleJourney() {
    if (journeyFrame !== null) return;
    journeyFrame = requestAnimationFrame(function () {
      journeyFrame = null;
      syncScreen();
    });
  }

  layoutJourney();
  if (wide.addEventListener) wide.addEventListener("change", layoutJourney);
  window.addEventListener("scroll", scheduleJourney, { passive: true });
  window.addEventListener("resize", scheduleJourney);

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
      void body.offsetHeight;
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
