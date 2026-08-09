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
    });