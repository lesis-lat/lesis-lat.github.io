// Runs in <head>, before the page paints, so a dark page never flashes light.
// A choice made with the header's theme button wins; otherwise the page
// follows the system setting. landing.js wires the button.
(function () {
  var theme = null;
  try { theme = localStorage.getItem("theme"); } catch (e) {}
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
