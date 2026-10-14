export type Theme = "light" | "dark";

const META_COLOR: Record<Theme, string> = { light: "#FBFAF8", dark: "#121110" };

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme, persist: boolean) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META_COLOR[theme]);
  if (!persist) return;
  try {
    window.localStorage.setItem("theme", theme);
  } catch {
    // private mode, ignore
  }
}

export function hasStoredTheme(): boolean {
  try {
    const t = window.localStorage.getItem("theme");
    return t === "light" || t === "dark";
  } catch {
    return false;
  }
}
