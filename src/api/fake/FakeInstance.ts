import {
    InstanceDocumentKind, InstanceDocumentRef, InstanceInfo, InstanceTheme, LocalisedLogo, ThemeColours,
} from "../CoreApi";
import { parse as parseYaml } from "yaml";
import { InstanceFontInput, ThemeInput, InstanceThemeInput } from "../ManagerApi";
import { seedInstanceDocuments } from "./fixtures/documents";
import { FakeFiles } from "./FileApiFake";
import { invalid } from "./refuse";

const INSTANCE_KEY = "algojudge.fake.instance";

/**
 * A theme for the browser checks, and **deliberately nobody's brand**.
 *
 * Every value is unmistakable — a purple that no product ships and a yellow
 * beside it — because its only job is to prove that each token reaches the
 * element it claims. A tasteful one would pass just as well while a token that
 * went nowhere looked fine.
 *
 * It ships no face on purpose: a family may be one of the four generic names
 * without a file behind it, so `serif` and `monospace` prove the two typeface
 * tokens land without putting a font binary in this repository.
 */
const FAKE_THEME: InstanceTheme = {
    light: {
        primary: "#7b1fa2",
        secondary: "#00838f",
        accent: "#ef6c00",
        link: "#2e7d32",
        body: "#f3e5f5",
        surface: "#fffde7",
        text: "#311b92",
        dimmed: "#4a148c",
        border: "#ce93d8",
        navBackground: "#4a148c",
        navText: "#ffe082",
        navActiveBackground: "#ffe082",
        navActiveText: "#4a148c",
        headerBackground: "#ede7f6",
        headerText: "#311b92",
    },
    dark: {
        primary: "#ce93d8",
        secondary: "#4dd0e1",
        accent: "#ffb74d",
        link: "#a5d6a7",
        body: "#12081f",
        surface: "#1c1030",
        text: "#ede7f6",
        dimmed: "#b39ddb",
        border: "#4527a0",
        navBackground: "#2a1a4a",
        navText: "#ffe082",
        navActiveBackground: "#ffe082",
        navActiveText: "#2a1a4a",
        headerBackground: "#1c1030",
        headerText: "#ede7f6",
    },
    fontFamily: "serif",
    fontFamilyHeadings: "monospace",
    fonts: [],
    fileId: "fake-theme",
    sha256: "0".repeat(64),
};

/** Six hexadecimal digits, as the Server's own rule. */
const COLOUR = /^#[0-9a-fA-F]{6}$/;

const THEME_FORMAT = "algojudge-theme";
const THEME_VERSION = 1;
const ROOT_KEYS = ["format", "version", "light", "dark", "fontFamily", "fontFamilyHeadings", "fonts"];

/**
 * A theme file, read the way the Server reads one.
 *
 * The narrow rules are repeated rather than skipped — format, version, an
 * unknown key named rather than ignored — because the screen has to behave here
 * as it does against a Server. A fake that accepted a file this installation
 * would refuse is a fake that hides the refusal until somebody deploys.
 */
function parseTheme(text: string): ThemeInput {
    let document: unknown;
    try {
        document = parseYaml(text);
    } catch (error) {
        invalid(`The theme is not readable as YAML: ${String(error)}`, "theme.syntax");
    }

    if (!document || typeof document !== "object") invalid("The theme file is empty", "theme.empty");
    const root = document as Record<string, unknown>;

    const unknown = Object.keys(root).find(key => !ROOT_KEYS.includes(key));
    if (unknown !== undefined) {
        invalid(
            `The theme states '${unknown}', which is not read. Accepted here: ${ROOT_KEYS.join(", ")}`,
            "theme.key");
    }

    if (root.format !== THEME_FORMAT) {
        invalid(`The theme states format '${String(root.format)}', and this reads '${THEME_FORMAT}'`, "theme.format");
    }
    if (root.version !== THEME_VERSION) {
        invalid(`The theme states version ${String(root.version)}, and this reads ${THEME_VERSION}`, "theme.version");
    }

    return {
        light: root.light as ThemeColours | undefined,
        dark: root.dark as ThemeColours | undefined,
        fontFamily: typeof root.fontFamily === "string" ? root.fontFamily : undefined,
        fontFamilyHeadings: typeof root.fontFamilyHeadings === "string" ? root.fontFamilyHeadings : undefined,
        fonts: Array.isArray(root.fonts) ? root.fonts as ThemeInput["fonts"] : undefined,
    };
}

/**
 * One scheme's colours, refused the way the Server refuses them.
 *
 * **The narrow rule is copied rather than skipped**, because the screen has to
 * behave here as it does against a Server: a value that would be turned away in
 * production must be turned away in the fake, or the form is only ever exercised
 * on its happy path. An empty field is absent, not black — that is what "leave
 * it at the default" looks like on the wire.
 */
function colours(stated: ThemeColours | undefined, scheme: string): ThemeColours | undefined {
    if (!stated) return undefined;

    const kept: Record<string, string> = {};
    for (const [key, value] of Object.entries(stated)) {
        const trimmed = (value ?? "").trim();
        if (trimmed.length === 0) continue;
        if (!COLOUR.test(trimmed)) {
            invalid(
                `${scheme}.${key} is '${trimmed}', which is not a colour: six hexadecimal digits `
                + "after a hash, and nothing else",
                "theme.colour");
        }
        kept[key] = trimmed.toLowerCase();
    }

    return Object.keys(kept).length > 0 ? kept as ThemeColours : undefined;
}

/**
 * What the installation says about itself, and the one copy of it.
 *
 * Held apart from either API because both need it: `CoreApiFake` answers
 * `getInstanceInfo` from it and `ManagerApiFake` writes it, which is the same
 * arrangement `FakeFiles` has and for the same reason — the Server has one row
 * and so should the fake.
 *
 * Settings survive a reload through `sessionStorage`; documents and marks do
 * not, because they are file references and the store is rebuilt on every load.
 * A stored id would name bytes this tab has never seen.
 */
export class FakeInstance {
    private info: InstanceInfo;
    /** Every revision ever published, newest first, per kind. */
    private readonly history = new Map<InstanceDocumentKind, InstanceDocumentRef[]>();
    /** The faces this instance has stored, by the name a theme calls them by. */
    private readonly faces = new Map<string, string>();

    constructor(private readonly files: FakeFiles) {
        this.info = FakeInstance.restore(seedInstanceDocuments(files));
        for (const ref of this.info.documents) this.remember(ref);
    }

    read(): InstanceInfo {
        return { ...this.info, documents: [...this.info.documents] };
    }

    settings(input: {
        name?: string;
        localRegistrationEnabled: boolean;
        requireEmail: boolean;
        requireConfirmedEmail: boolean;
        showLogo: boolean;
        accountDeletionEnabled: boolean;
        externalJudgingEnabled: boolean;
    }): InstanceInfo {
        this.info = {
            ...this.info,
            name: input.name?.trim() || undefined,
            localRegistrationEnabled: input.localRegistrationEnabled,
            requireEmail: input.requireEmail,
            requireConfirmedEmail: input.requireConfirmedEmail,
            showLogo: input.showLogo,
            accountDeletionEnabled: input.accountDeletionEnabled,
            externalJudgingEnabled: input.externalJudgingEnabled,
        };
        this.persist();
        return this.read();
    }

    logo(fileId: string | undefined, language: string | undefined): InstanceInfo {
        const mark = fileId === undefined ? undefined : (() => {
            const stored = this.files.meta(fileId);
            return {
                url: this.files.url(fileId),
                mimeType: stored.mimeType,
                sizeBytes: stored.sizeBytes,
                sha256: stored.sha256,
            };
        })();

        if (language === undefined) {
            this.info = { ...this.info, logo: mark };
        } else {
            const others = (this.info.logoTranslations ?? []).filter(entry => entry.language !== language);
            const translations: LocalisedLogo[] = mark
                ? [...others, { language, logo: mark }]
                : others;
            this.info = { ...this.info, logoTranslations: translations.length > 0 ? translations : undefined };
        }
        this.persist();
        return this.read();
    }

    /**
     * The theme, by either of its two doors — as the Server, which refuses a
     * request stating both.
     *
     * **The file door reads the file.** It answered without looking at one until
     * the screen's own *Import a theme file* button was tried against this fake:
     * a button that appears to work and changes nothing is worse than one that
     * refuses, and a fake that only ever exercises the happy half of a contract
     * is a fake the screens are not really tested against.
     *
     * @param text The file's contents, read by the caller — this class is
     * synchronous and a `Blob` is not.
     */
    setTheme(input: InstanceThemeInput, text: string | undefined): InstanceInfo {
        if ((input.fileId === undefined) === (input.theme === undefined)) {
            invalid(
                "A theme is set either from a file or from values, and this request states "
                + (input.fileId === undefined ? "neither" : "both"),
                "theme.input");
        }

        const stated = input.theme ?? parseTheme(text ?? "");
        const theme: InstanceTheme = {
            light: colours(stated.light, "light"),
            dark: colours(stated.dark, "dark"),
            fontFamily: stated.fontFamily?.trim() || undefined,
            fontFamilyHeadings: stated.fontFamilyHeadings?.trim() || undefined,
            fonts: (stated.fonts ?? []).map(face => {
                const stored = this.faces.get(face.file);
                if (!stored) {
                    invalid(
                        `The theme names ${face.file}, which this installation has not stored`,
                        "theme.font.missing");
                }
                const meta = this.files.meta(stored);
                return {
                    name: face.file,
                    family: face.family,
                    weight: face.weight ?? 400,
                    style: face.style ?? "normal",
                    url: this.files.url(stored),
                    sha256: meta.sha256,
                    sizeBytes: meta.sizeBytes,
                };
            }),
            fileId: input.fileId ?? "fake-theme",
            sha256: "0".repeat(64),
        };

        this.info = { ...this.info, theme };
        this.persist();
        return this.read();
    }

    clearTheme(): InstanceInfo {
        this.info = { ...this.info, theme: undefined };
        this.persist();
        return this.read();
    }

    fontNames(): string[] {
        return [...this.faces.keys()].sort();
    }

    addFont(input: InstanceFontInput): InstanceInfo {
        if (!/^[A-Za-z0-9._-]{1,96}\.woff2$/.test(input.name)) {
            invalid(
                `'${input.name}' is not a face's name — a name ending .woff2, never a path`,
                "font.name");
        }
        // Not read: the fake has no bytes to check a signature against, and the
        // rule it stands in for is the Server's. Said out loud rather than
        // pretended, because a check that only looks like one is worse than none.
        this.files.meta(input.fileId);
        this.faces.set(input.name, input.fileId);
        return this.read();
    }

    removeFont(name: string): InstanceInfo {
        if (this.info.theme?.fonts.some(face => face.name === name)) {
            invalid(`The published theme draws with '${name}'`, "font.inUse");
        }
        this.faces.delete(name);
        return this.read();
    }

    /**
     * Publishes a revision: added, never replacing. The one in force is the
     * newest whose `validFrom` has passed, and this screen only ever publishes
     * as of now — so it is simply the newest.
     */
    publish(kind: InstanceDocumentKind, statements: { language?: string; fileId: string }[]): InstanceInfo {
        if (statements.length === 0) {
            invalid("A document with no text is a document nobody can read", "document.empty");
        }
        const validFrom = new Date().toISOString();
        const published: InstanceDocumentRef[] = statements.map(statement => {
            const stored = this.files.meta(statement.fileId);
            return {
                kind,
                language: statement.language,
                // The title of a legal document is its own; the front pages
                // carry their heading inside the text.
                title: kind === "welcome" || kind === "home" ? undefined : this.titleOf(kind, statement.language),
                validFrom,
                isTemplate: false,
                fileId: statement.fileId,
                sha256: stored.sha256,
                sizeBytes: stored.sizeBytes,
            };
        });
        for (const ref of published) this.remember(ref);
        this.info = {
            ...this.info,
            documents: [...this.info.documents.filter(ref => ref.kind !== kind), ...published],
        };
        return this.read();
    }

    /** Stops publishing one. The revisions stay in the history at their dates. */
    unpublish(kind: InstanceDocumentKind): InstanceInfo {
        this.info = { ...this.info, documents: this.info.documents.filter(ref => ref.kind !== kind) };
        return this.read();
    }

    historyOf(kind: InstanceDocumentKind): InstanceDocumentRef[] {
        return [...(this.history.get(kind) ?? [])];
    }

    /** The file name a language's text is stored under, for the uploader. */
    static fileName(kind: InstanceDocumentKind, language: string | undefined): string {
        return language ? `${kind}-${language}.md` : `${kind}.md`;
    }

    private titleOf(kind: InstanceDocumentKind, language: string | undefined): string | undefined {
        // Kept from whatever was published before, so republishing a policy does
        // not silently rename it. A first publication has none, and the screen
        // falls back to the translated name of the kind.
        return this.historyOf(kind).find(ref => ref.language === language)?.title;
    }

    private remember(ref: InstanceDocumentRef): void {
        const kept = this.history.get(ref.kind) ?? [];
        this.history.set(ref.kind, [ref, ...kept]);
    }

    private persist(): void {
        // Settings only, named one by one rather than by subtraction: documents
        // and marks are file references, and a file id does not survive the
        // store being rebuilt on the next load.
        sessionStorage.setItem(INSTANCE_KEY, JSON.stringify({
            name: this.info.name,
            localRegistrationEnabled: this.info.localRegistrationEnabled,
            requireEmail: this.info.requireEmail,
            requireConfirmedEmail: this.info.requireConfirmedEmail,
            showLogo: this.info.showLogo,
            accountDeletionEnabled: this.info.accountDeletionEnabled,
            externalJudgingEnabled: this.info.externalJudgingEnabled,
            // The theme is values rather than a file reference, so unlike the
            // documents and the mark it does survive a reload — which is what
            // lets somebody set one on this screen and then walk the others.
            // Its faces do not: those are file ids, and the store is rebuilt.
            theme: this.info.theme
                ? { ...this.info.theme, fonts: [] }
                : undefined,
        }));
    }

    private static restore(documents: InstanceDocumentRef[]): InstanceInfo {
        // The shipped default: accounts come from an organiser or from SSO.
        const defaults: InstanceInfo = {
            name: "Wydział Informatyki",
            localRegistrationEnabled: false,
            requireEmail: false,
            requireConfirmedEmail: false,
            documents,
            // No logo: this instance has not set one, so the Client shows the
            // placeholder it ships with. `?fakeLogo=off` turns the mark off
            // entirely, which is what an operator who wants none does.
            showLogo: true,
        showLocalSignIn: true,
            // Two providers, because one is the case that hides every mistake:
            // a list, an ordering and a slug that has to reach the right one.
            // `?fakeProviders=off` is the installation that federates nothing,
            // which is what the login screen looks like today.
            providers: [
                { slug: "university", displayName: "Uczelniane SSO" },
                { slug: "algojudge", displayName: "AlgoJudge" },
            ],
            // A right before it is a feature, so the fake ships it on.
            accountDeletionEnabled: true,
            // And this one off, exactly as an installation gets it.
            externalJudgingEnabled: false,
        };

        // Merged over the defaults rather than trusting what was stored. A tab
        // that kept settings written by an older build has an object missing
        // whatever was added since, and reading a field that is not there is how
        // `undefined.map` reaches a screen.
        const stored = sessionStorage.getItem(INSTANCE_KEY);
        let instance = defaults;
        if (stored) {
            try {
                instance = { ...defaults, ...JSON.parse(stored) as Partial<InstanceInfo> };
            } catch {
                instance = defaults;
            }
        }
        instance.documents = documents;

        const query = new URLSearchParams(window.location.search);
        const flag = (name: string): boolean | undefined => {
            const value = query.get(name);
            return value === null ? undefined : value === "on" || value === "true" || value === "1";
        };

        const registration = flag("fakeRegistration");
        const requireEmail = flag("fakeRequireEmail");
        const confirmEmail = flag("fakeConfirmEmail");
        const logo = flag("fakeLogo");
        // An installation nobody has named is a state the screens have to draw,
        // not only a field that could be absent.
        const named = flag("fakeName");
        // And one that publishes nothing at all: no footer links, no navigation
        // entries, and nothing where a front page would be.
        const documented = flag("fakeDocuments");
        // The installation that federates nothing: no buttons, and a login form
        // that is the whole of the screen.
        const federated = flag("fakeProviders");
        const removable = flag("fakeAccountDeletion");
        // The installation that carries its own colours. Off by default, because
        // the other forty-six checks read the screens as they ship.
        const themed = flag("fakeTheme");
        if (themed === true) instance.theme = FAKE_THEME;
        if (themed === false) instance.theme = undefined;
        if (registration !== undefined) instance.localRegistrationEnabled = registration;
        if (requireEmail !== undefined) instance.requireEmail = requireEmail;
        if (confirmEmail !== undefined) instance.requireConfirmedEmail = confirmEmail;
        if (logo !== undefined) instance.showLogo = logo;
        if (named === false) instance.name = undefined;
        if (documented === false) instance.documents = [];
        if (federated === false) instance.providers = [];
        if (removable !== undefined) instance.accountDeletionEnabled = removable;

        // Never restored from storage: the fake's providers are fixtures, and a
        // tab that kept an older list would offer a button whose slug the fake
        // no longer answers.
        instance.providers = instance.providers ?? [];

        return instance;
    }
}
