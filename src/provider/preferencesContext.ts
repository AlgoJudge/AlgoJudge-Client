import { createContext, useContext } from "react";

/**
 * The reader's own choices — interface language and colour scheme — apart from
 * the component that stores them, so that editing either keeps fast refresh.
 */

export type ThemeType = "light" | "dark" | undefined;

export interface PreferencesType {
    lang: string | undefined,
    theme: ThemeType,
    setLang: (lang: string) => void,
    setTheme: (theme: ThemeType) => void;
}

export const PreferencesContext = createContext<PreferencesType>({} as PreferencesType);

export const usePreferences = () => {
    const context = useContext(PreferencesContext);
    if (!context) throw Error('usePreferences can only be used insde a PreferencesProvider');
    return context;
}
