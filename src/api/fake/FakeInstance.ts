import { InstanceDocumentKind, InstanceDocumentRef, InstanceInfo, LocalisedLogo } from "../CoreApi";
import { seedInstanceDocuments } from "./fixtures/documents";
import { FakeFiles } from "./FileApiFake";
import { Utils } from "./Utils";

const INSTANCE_KEY = "algojudge.fake.instance";

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
    }): InstanceInfo {
        this.info = {
            ...this.info,
            name: input.name?.trim() || undefined,
            localRegistrationEnabled: input.localRegistrationEnabled,
            requireEmail: input.requireEmail,
            requireConfirmedEmail: input.requireConfirmedEmail,
            showLogo: input.showLogo,
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
     * Publishes a revision: added, never replacing. The one in force is the
     * newest whose `validFrom` has passed, and this screen only ever publishes
     * as of now — so it is simply the newest.
     */
    publish(kind: InstanceDocumentKind, statements: { language?: string; fileId: string }[]): InstanceInfo {
        if (statements.length === 0) {
            Utils.throwError("A document with no text is a document nobody can read");
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
        if (registration !== undefined) instance.localRegistrationEnabled = registration;
        if (requireEmail !== undefined) instance.requireEmail = requireEmail;
        if (confirmEmail !== undefined) instance.requireConfirmedEmail = confirmEmail;
        if (logo !== undefined) instance.showLogo = logo;
        if (named === false) instance.name = undefined;
        if (documented === false) instance.documents = [];

        return instance;
    }
}
