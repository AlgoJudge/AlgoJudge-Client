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
    documents: [],
    localRegistrationEnabled: false,
    requireEmail: false,
    requireConfirmedEmail: false,
    showLogo: true,
        showLocalSignIn: true,
    // **Empty, and that is the safe default rather than the pessimistic one.**
    // A sign-in button drawn before the answer arrives would point at a provider
    // this installation may not have registered, and a 404 in the middle of
    // signing in is worse than a button that appears a moment later.
    providers: [],
    // The other way round: the account screen offers removal, and an
    // installation that has closed it says so when the answer arrives. Starting
    // from `false` would hide a right from everybody for the length of a fetch.
    accountDeletionEnabled: true,
    // And this one starts `false`, for the mirror-image reason: assuming the
    // door is open before the answer arrives would be a screen saying work
    // leaves the building on an installation where it does not.
    externalJudgingEnabled: false,
};

export const InstanceProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const { i18n } = useTranslation();
    const [instance, setInstance] = useState<InstanceInfo>(DEFAULTS);
    const [answered, setAnswered] = useState(false);

    /**
     * Whether the installation has answered yet, on the root element.
     *
     * The same device `MaintenanceProvider` uses and for the same reason: the
     * defaults are drawn while the answer is in flight, so a screen that has
     * loaded and a screen that has been *told what installation it is* are two
     * different moments, and only the document can say which one this is.
     *
     * It exists because the browser checks need it — a check that waited for
     * text and then read a colour was reading the default one, and waiting
     * longer is not a fix for that, it is a slower version of the same race.
     */
    useEffect(() => {
        document.documentElement.dataset.instance = answered ? "loaded" : "unknown";
    }, [answered]);

    useEffect(() => {
        const controller = new AbortController();
        api.authApi.getInstanceInfo(controller.signal)
            // Merged over the defaults rather than replacing them: an older
            // Server that answers without a field must not remove it.
            .then(info => setInstance({ ...DEFAULTS, ...info }))
            .catch(() => { /* The defaults are a usable answer. */ })
            // **Answered either way.** A Server that refused is an answer too:
            // the defaults are what this installation looks like, and a screen
            // waiting for a success would wait for ever during an outage.
            .finally(() => { if (!controller.signal.aborted) setAnswered(true); });

        // An operator publishing a document or a mark changes what every screen
        // shows — the footer, the navigation, the front page — so the answer is
        // replaced where it is held rather than each of them being told to
        // reload. The event carries the whole thing for exactly that reason.
        api.managerApi.eventDispatcher.addEventListener(
            "instanceChanged",
            evt => setInstance({ ...DEFAULTS, ...evt.data.instance }),
            controller.signal);

        return () => controller.abort();
    }, [api]);

    // The tab says whose installation this is, after saying what software it is:
    // the product first, because that is what the reader recognises across
    // installations, and the operator's name after it where there is one. An
    // unnamed installation says `AlgoJudge` and nothing else — the same title
    // `index.html` carries before any of this has loaded.
    //
    // Set here rather than per screen: it is the one fact every tab shares, and
    // a per-screen title can be built on top of it later.
    useEffect(() => {
        document.title = instance.name ? `AlgoJudge | ${instance.name}` : "AlgoJudge";
    }, [instance.name]);

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
