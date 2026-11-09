import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { dirOf, type Language } from "@shared/i18n";
import i18n, { rememberLanguage, storedLanguage } from "@/lib/i18n";

interface LanguageContextValue {
  language: Language;
  dir: "rtl" | "ltr";
  setLanguage: (lang: Language) => void;
  /** Called with the signed-in user's saved language, which wins over the local one. */
  adoptStoredPreference: (lang: Language | null | undefined) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}

// The one place in the app that writes `lang` and `dir`. Direction is derived from the language and is
// never settable on its own, so Arabic is always RTL and English always LTR.
//
// CSS direction set on <html> is also what gives Radix portals (dialogs, selects, dropdowns) their
// direction — they render under <body>, so a `dir` on a page wrapper would never reach them. The
// DirectionProvider below is separate: it tells Radix's *JavaScript* which way arrow keys and
// collision placement should go.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(storedLanguage);
  const dir = dirOf(language);
  const currentRef = useRef(language);
  currentRef.current = language;

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = dir;
  }, [language, dir]);

  const applyLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    rememberLanguage(lang);
    void i18n.changeLanguage(lang);
  }, []);

  const setLanguage = applyLanguage;

  // The signed-in user's stored choice is the truth; localStorage only covers the moment before the
  // session resolves, and the sign-in screen. Adopting it here is what makes the choice follow them
  // to another device. Identity-stable on purpose: auth holds it across renders.
  const adoptStoredPreference = useCallback((lang: Language | null | undefined) => {
    if (lang && lang !== currentRef.current) applyLanguage(lang);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, dir, setLanguage, adoptStoredPreference }}>
      <DirectionProvider dir={dir}>{children}</DirectionProvider>
    </LanguageContext.Provider>
  );
}
