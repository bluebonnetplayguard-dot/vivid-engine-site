import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// English / Spanish. The choice sets <html lang>, switches the navigation labels, and asks AI Search to answer
// in Spanish. Page copy is English for now; pages written in Spanish can read `lang` from here.
const LangContext = createContext({ lang: 'en', setLang: () => {} });
const KEY = 've-lang';
const read = () => { try { const v = localStorage.getItem(KEY); return v === 'es' ? 'es' : 'en'; } catch { return 'en'; } };

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => (typeof window === 'undefined' ? 'en' : read()));
  useEffect(() => { if (typeof document !== 'undefined') document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback(v => { const next = v === 'es' ? 'es' : 'en'; setLangState(next); try { localStorage.setItem(KEY, next); } catch { /* private window */ } }, []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}
export const useLang = () => useContext(LangContext);
