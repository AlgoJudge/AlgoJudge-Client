import { FC, ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceInfo } from "../api/CoreApi";
import { pickTranslation } from "../components/content/languageName";
import { useApi } from "./apiContext";
import { InstanceContext } from "./instanceContext";
import placeholderLogo from "../assets/instance-logo.svg";

/**
 * What the installation says about itself.
 *
 * Fetched once and shared. Four screens and the shell need it — whether sign-ups
 * exist, which legal documents to link, which mark to draw — and an answer that
 * decides whether a registration form exists at all should not depend on which
 * screen happened to ask.
 *
 * "Loading" is not a state here: every field has a default that is safe to draw
 * — no registration, no documents, the shipped logo — and a shell that waited
 * would flash empty on every load.
 */

const DEFAULTS: InstanceInfo = {
    localRegistrationEnabled: false,
    requireEmail: false,
    requireConfirmedEmail: false,
    legalDocuments: [],
    showLogo: true,
};

export const InstanceProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const { i18n } = useTranslation();
    const [instance, setInstance] = useState<InstanceInfo>(DEFAULTS);

    useEffect(() => {
        const controller = new AbortController();
        api.authApi.getInstanceInfo(controller.signal)
            // Merged over the defaults rather than replacing them: an older
            // Server that answers without a field must not remove it.
            .then(info => setInstance({ ...DEFAULTS, ...info }))
            .catch(() => { /* The defaults are a usable answer. */ });
        return () => controller.abort();
    }, [api]);

    // An institution whose wordmark differs between languages sets one per
    // language; everyone else sets one, and an instance that set none shows the
    // placeholder.
    const translated = pickTranslation(instance.logoTranslations, i18n.language)?.logo;
    const logoUrl = instance.showLogo
        ? (translated ?? instance.logo)?.url ?? placeholderLogo
        : undefined;

    return (
        <InstanceContext.Provider value={{ instance, logoUrl }}>
            {children}
        </InstanceContext.Provider>
    );
};
