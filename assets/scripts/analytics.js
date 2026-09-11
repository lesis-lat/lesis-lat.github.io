(function () {
  if (window.location.host === "lesis.lat" && window.location.protocol !== "https:") {
    window.location.protocol = "https:";
    return;
  }

  var loaded = false;
  function loadGoogleTag() {
    if (loaded) return;
    loaded = true;
    var script = document.createElement("script");
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-BF7S2MHBGH";
    script.async = true;
    script.onload = function () {
      window.dataLayer = window.dataLayer || [];
      function gtag() { window.dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag("js", new Date());
      gtag("config", "G-BF7S2MHBGH");
    };
    document.head.appendChild(script);
  }

  ["click", "scroll", "keydown", "mousemove", "touchstart"].forEach(function (name) {
    window.addEventListener(name, loadGoogleTag, { once: true, passive: true });
  });
  setTimeout(loadGoogleTag, 3000);
})();
