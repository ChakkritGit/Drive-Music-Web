import { describe, expect, it, vi } from "vitest";
import {
  THEMES,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  themeInitScript,
} from "@/lib/themes";

describe("resolveTheme", () => {
  it("resolves system against the OS preference", () => {
    expect(resolveTheme("system", true).id).toBe("dark");
    expect(resolveTheme("system", false).id).toBe("light");
  });

  it("ignores the OS preference once a theme is picked", () => {
    expect(resolveTheme("horror", false).id).toBe("horror");
    expect(resolveTheme("retro", true).id).toBe("retro");
  });
});

describe("isThemePreference", () => {
  it("accepts every registered theme plus system", () => {
    expect(isThemePreference("system")).toBe(true);
    for (const theme of THEMES) expect(isThemePreference(theme.id)).toBe(true);
  });

  it("rejects anything else", () => {
    // Stale or hand-edited localStorage values must fall back rather than stamp an unknown
    // data-theme onto <html>, which would leave the app painted in :root's Light defaults.
    for (const value of ["", "Dark", "vaporwave", "toString", null, undefined, 3]) {
      expect(isThemePreference(value)).toBe(false);
    }
  });
});

describe("themeInitScript", () => {
  const script = themeInitScript();

  it("carries the same id → scheme mapping as the registry", () => {
    for (const theme of THEMES) {
      expect(script).toContain(`"${theme.id}":"${theme.scheme}"`);
    }
  });

  it("reads the key the provider writes", () => {
    expect(script).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("resolves a stored theme to its scheme before paint", () => {
    const setAttribute = vi.fn();
    runScript(script, { "drive-music-theme": "horror" }, false, setAttribute);
    expect(setAttribute).toHaveBeenCalledWith("data-theme", "horror");
    expect(setAttribute).toHaveBeenCalledWith("data-scheme", "dark");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    const setAttribute = vi.fn();
    runScript(script, {}, true, setAttribute);
    expect(setAttribute).toHaveBeenCalledWith("data-theme", "dark");
    expect(setAttribute).toHaveBeenCalledWith("data-scheme", "dark");
  });

  it("falls back to the OS preference for an unknown stored value", () => {
    const setAttribute = vi.fn();
    runScript(script, { "drive-music-theme": "vaporwave" }, false, setAttribute);
    expect(setAttribute).toHaveBeenCalledWith("data-theme", "light");
    expect(setAttribute).toHaveBeenCalledWith("data-scheme", "light");
  });

  it("is not fooled by a stored value that names an Object.prototype member", () => {
    const setAttribute = vi.fn();
    runScript(script, { "drive-music-theme": "toString" }, true, setAttribute);
    expect(setAttribute).toHaveBeenCalledWith("data-theme", "dark");
    expect(setAttribute).toHaveBeenCalledWith("data-scheme", "dark");
  });

  it("survives localStorage throwing", () => {
    const setAttribute = vi.fn();
    expect(() =>
      new Function(
        "localStorage",
        "matchMedia",
        "document",
        script,
      )(
        {
          getItem() {
            throw new Error("storage disabled");
          },
        },
        () => ({ matches: false }),
        { documentElement: { setAttribute } },
      ),
    ).not.toThrow();
  });
});

/** Runs the head script's source with the handful of browser globals it touches stubbed out. */
function runScript(
  script: string,
  storage: Record<string, string>,
  prefersDark: boolean,
  setAttribute: (name: string, value: string) => void,
): void {
  new Function("localStorage", "matchMedia", "document", script)(
    { getItem: (key: string) => storage[key] ?? null },
    () => ({ matches: prefersDark }),
    { documentElement: { setAttribute } },
  );
}
