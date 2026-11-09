import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, defaultNS, isLanguage, resources, type Language } from "@shared/i18n";

const STORAGE_KEY = "language";

// Read synchronously at boot so an English user never sees a frame of Arabic. The server's stored
// preference wins once auth resolves; see language-provider.tsx.
export function storedLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(v)) return v;
  } catch {
    // private mode, or site data blocked
  }
  return DEFAULT_LANGUAGE;
}

export function rememberLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // nothing to do: the preference still lives on the user record
  }
}

// A fake language built from Arabic at boot, for checking the work rather than for reading.
//
// Every value is wrapped in brackets and padded by about 40%. Anything on screen that is NOT bracketed
// is a string still written into the code — that is the measurement. The padding catches the other
// half of the problem: labels that fit in English but overflow their button once translated.
//
// Reach it with ?lng=en-XA.
const PSEUDO = "en-XA";

function pseudoise(value: unknown): unknown {
  if (typeof value === "string") {
    const padding = "·".repeat(Math.ceil(value.length * 0.4));
    return `⟦${value}${padding}⟧`;
  }
  if (Array.isArray(value)) return value.map(pseudoise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pseudoise(v)]));
  }
  return value;
}

const pseudoResources = import.meta.env.DEV ? { [PSEUDO]: pseudoise(resources.ar) as typeof resources.ar } : {};

function pseudoRequested(): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  try {
    return new URLSearchParams(window.location.search).get("lng") === PSEUDO ? PSEUDO : undefined;
  } catch {
    return undefined;
  }
}

i18next.use(initReactI18next).init({
  resources: { ...resources, ...pseudoResources } as typeof resources,
  lng: pseudoRequested() ?? storedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS,
  interpolation: { escapeValue: false }, // React escapes already
  returnNull: false,
  returnEmptyString: false,
  // A typo in a key should be loud in development, not a silently blank cell
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (_lngs, ns, key) => console.error(`[i18n] missing key: ${ns}:${key}`)
    : undefined,
});

export default i18next;
