import { FC, ReactNode, useEffect, useState } from "react";
import { PreferencesContext, ThemeType } from "./preferencesContext";

export const PreferencesProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [lang, setLang2] = useState<string | undefined>(undefined);
    const [theme, setTheme2] = useState<"light" | "dark" | undefined>(undefined);
    const setLang = (lang: string) => {
        setLang2(lang);
    }
    const setTheme = (theme: ThemeType) => {
        setTheme2(theme);
    }
    useEffect(() => {
        if (!theme) return;
        localStorage.setItem('theme', theme);
    }, [theme]);
    useEffect(() => {
        if (!lang) return;
        localStorage.setItem('lang', lang);
    }, [lang]);
    useEffect(() => {
        const lsTheme = localStorage.getItem('theme');
        if (lsTheme) setTheme(lsTheme == 'dark' ? 'dark' : 'light');
        const lsLang = localStorage.getItem('lang');
        if (lsLang) setLang(lsLang);
    }, []);
    return (
        <PreferencesContext.Provider value={{ lang, theme, setLang, setTheme }}>{children}</PreferencesContext.Provider>
    )
}
