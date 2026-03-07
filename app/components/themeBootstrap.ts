const STORAGE_KEY = "full-hangar-theme"
const DEFAULT_THEME = "light"

export function getThemeBootstrapScript() {
  return `
    (function() {
      try {
        var key = "${STORAGE_KEY}";
        var theme = localStorage.getItem(key);
        if (theme !== "light" && theme !== "dark") theme = "${DEFAULT_THEME}";
        document.documentElement.setAttribute("data-theme", theme);
      } catch (e) {
        document.documentElement.setAttribute("data-theme", "${DEFAULT_THEME}");
      }
    })();
  `
}
