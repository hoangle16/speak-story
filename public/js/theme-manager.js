export class ThemeManager {
  constructor() {
    this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  }

  init() {
    this.#applyTheme();
    this.#setupEventListeners();
  }

  #applyTheme() {
    if (
      localStorage.theme === "dark" ||
      (!("theme" in localStorage) && this.mediaQuery.matches)
    ) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  #handleSystemThemeChange = (e) => {
    if (!("theme" in localStorage)) {
      if (e.matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  };

  #handleToggleClick = () => {
    const isDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark");
    localStorage.theme = isDark ? "light" : "dark";
  };

  #setupEventListeners() {
    this.mediaQuery.addEventListener("change", this.#handleSystemThemeChange);

    const themeToggleBtn = document.getElementById("themeToggle");
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", this.#handleToggleClick);
    }
  }

  cleanup() {
    this.mediaQuery.removeEventListener(
      "change",
      this.#handleSystemThemeChange
    );
    const themeToggleBtn = document.getElementById("themeToggle");
    if (themeToggleBtn) {
      themeToggleBtn.removeEventListener("click", this.#handleToggleClick);
    }
  }
}
