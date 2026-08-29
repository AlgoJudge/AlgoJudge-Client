import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: 'en',
        debug: true,

        /*
         * **A colon in a key is part of the key, not a namespace.**
         *
         * i18next splits on `:` by default, so `t("permission.submission:read:own")`
         * asked for key `read:own` in a namespace called `permission.submission`,
         * found nothing, and returned the fragment — the grant editor showed
         * `read.own` where `Widzi swoje zgłoszenia` was written, and had done
         * since those strings were added. Forty-six permission labels were
         * translated and none of them ever reached a screen.
         *
         * Safe to switch off because there is one namespace, `translation`, and
         * nothing here ever names another. Permission keys are `area:action`
         * by definition, so they will keep containing colons.
         */
        nsSeparator: false,

        /*
         * **A browser says `pl-PL`, and only `pl` is on disk.**
         *
         * Without this i18next asks for `/locales/pl-PL/translation.json`, the
         * SPA fallback answers with `index.html` and **200**, and parsing it as
         * JSON fails — on every page load, for every visitor whose browser
         * names a region, which is most of them. It recovers, so nothing broke;
         * what it cost was a wasted request and a console error loud enough to
         * hide a real one. `de-DE` cost two.
         *
         * `languageOnly` asks for the base language. `supportedLngs` stops the
         * request for a language this installation does not have at all, and
         * lists what `public/locales/` actually contains.
         */
        load: "languageOnly",
        supportedLngs: ["pl", "en"],

        /*
         * **React already escapes; i18next escaping again produces entities.**
         *
         * Its default is `escapeValue: true`, which HTML-escapes every
         * interpolated value — and React then renders the escape sequence
         * literally, because it is text by the time React sees it. A provider
         * named `Konto AlgoJudge / AlgoJudge account` came out as
         * `Konto AlgoJudge &#x2F; AlgoJudge account`, on the account screen and
         * on the sign-in button both.
         *
         * It went unnoticed because no interpolated value had contained a
         * character worth escaping until one carried a slash. Turning it off is
         * the documented setting for React and gives up no protection: React
         * escapes anything that is not `dangerouslySetInnerHTML`, and nothing
         * here is.
         */
        interpolation: { escapeValue: false },
    });