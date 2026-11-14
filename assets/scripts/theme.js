(function () {
  var STORAGE_KEY = "theme";
  var root = document.documentElement;
  var systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  function savedTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
  }

  function systemTheme() {
    return systemPrefersDark.matches ? "dark" : "light";
  }

  function preferredTheme() {
    var theme = savedTheme();
    return theme === "light" || theme === "dark" ? theme : systemTheme();
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
  }

  function toggleTheme() {
    var nextTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    saveTheme(nextTheme);
  }

  applyTheme(preferredTheme());

  if (systemPrefersDark.addEventListener) {
    systemPrefersDark.addEventListener("change", function () {
      applyTheme(preferredTheme());
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggleButton = document.querySelector("[data-theme-toggle]");
    if (toggleButton) toggleButton.addEventListener("click", toggleTheme);
  });
})();
