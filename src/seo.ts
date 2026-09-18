/**
 * The two things about this document that can only be known once it is running.
 *
 * Everything else a crawler reads is static, in `index.html`, because a crawler
 * that does not execute JavaScript never gets this far. These two cannot be:
 * one changes while the reader is on the page, and the other depends on the
 * host, which one image serving every installation does not know until a
 * browser has loaded it.
 *
 * Imported for its side effects from `main.tsx`, immediately after `./i18n`.
 */
import i18n from "i18next";

/**
 * **The document says which language it is in.**
 *
 * `index.html` is `lang="en"` and was that on every screen, in both languages,
 * for as long as this application has been bilingual. A screen reader announces
 * Polish prose in an English voice from that attribute alone, and it is the
 * first thing it decides — before any text has been read out.
 *
 * The base subtag only: `load: "languageOnly"` means what is on disk is `pl`
 * and `en`, while the detector may hand back `pl-PL` from the browser.
 */
const speak = () => {
    const tag = (i18n.resolvedLanguage ?? i18n.language ?? "").split("-")[0];
    if (tag) document.documentElement.lang = tag;
};

i18n.on("languageChanged", speak);
i18n.on("initialized", speak);
speak();

/**
 * **The address this page is, without the parts that are not the page.**
 *
 * Four query parameters reach public screens — `?lng=`, which i18next's detector
 * honors, `?admin=true` and `?error=` on the sign-in screen, and the enrollment
 * fragment — and each makes an address a renderer would otherwise index as a
 * page of its own with the same content on it.
 *
 * **Once, at load, rather than on every navigation**, and that is deliberate: a
 * crawler fetches each address on its own, so it is the loaded one that has to
 * be right. An in-app navigation is a reader moving around, not a crawl.
 *
 * Absolute, because a canonical must be, and this is the one place the host is
 * known — `index.html` is written before an installation has a name.
 */
const link =
    document.querySelector<HTMLLinkElement>("link[rel=canonical]") ??
    document.head.appendChild(Object.assign(document.createElement("link"), { rel: "canonical" }));

link.href = `${window.location.origin}${window.location.pathname}`;
