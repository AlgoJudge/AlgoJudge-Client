import {
    Alert, Anchor, Button, Card, ColorInput, Divider, FileButton, Grid, Group, Select, Stack, Text,
    Title, Tooltip,
} from "@mantine/core";
import { IconDownload, IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ThemeColours } from "../../../api/CoreApi";
import { ThemeInput } from "../../../api/ManagerApi";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";
import { useInstance } from "../../../provider/instanceContext";

/**
 * The installation's own colours and typeface.
 *
 * ## An empty field is the default, and the form has to say so
 *
 * Nothing here has a value until somebody types one. An untouched field is sent
 * as absent, the Server stores no key for it, and the screen draws what
 * AlgoJudge ships — so clearing a colour is how an operator undoes it, and the
 * notice at the top says that rather than leaving it to be discovered.
 *
 * ## Why the form writes a file
 *
 * Saving serialises what is here into the theme file and publishes it, which is
 * the same document an operator can write by hand and drop into a
 * pre-configuration directory. **One thing is in force and one thing can be
 * downloaded**; the form is a door to it rather than a second place a colour
 * lives.
 *
 * ## What is not here
 *
 * Radius, spacing, shadow and font size are the product's. So are the status
 * colours — a green *wrong answer* is a defect rather than a preference, and no
 * validation could catch it, because every hex is formally valid.
 */

type Group = { id: "brand" | "surface" | "shell"; fields: (keyof ThemeColours)[] };

/** One field per token, grouped the way somebody thinks about a brand. */
const GROUPS: Group[] = [
    { id: "brand", fields: ["primary", "secondary", "accent", "link"] },
    { id: "surface", fields: ["body", "surface", "text", "dimmed", "border"] },
    {
        id: "shell",
        fields: [
            "navBackground", "navText", "navActiveBackground", "navActiveText",
            "headerBackground", "headerText",
        ],
    },
];

/**
 * The words, written out.
 *
 * **`check:i18n` reads only a call written out in full**, so a label built from a table
 * would be a translation nothing checks — and a missing key is not an error:
 * i18next falls back to the key, which is the English text, so a Polish screen
 * would quietly render an English sentence with lint, typecheck and the build
 * all silent. That is why these are switches rather than a column in `GROUPS`.
 */
function groupTitle(id: Group["id"], t: TFunction): string {
    switch (id) {
        case "brand": return t("Brand");
        case "surface": return t("Surface and text");
        case "shell": return t("The shell");
    }
}

function groupHint(id: Group["id"], t: TFunction): string {
    switch (id) {
        case "brand":
            return t("One colour each. The ten shades a screen needs are worked out from it, so this one value reaches a pale panel, a rule and dark text on it.");
        case "surface":
            return t("The ground a page sits on, the panels on it, and what is written there.");
        case "shell":
            return t("The navigation and the bar above a signed-out page. Their hover and quiet states are worked out from these four, so there is nothing else to fill in.");
    }
}

function fieldLabel(key: keyof ThemeColours, t: TFunction): string {
    switch (key) {
        case "primary": return t("Primary");
        case "secondary": return t("Secondary");
        case "accent": return t("Accent");
        case "link": return t("Links");
        case "body": return t("Page background");
        case "surface": return t("Panels and cards");
        case "text": return t("Text");
        case "dimmed": return t("Secondary text");
        case "border": return t("Borders");
        case "navBackground": return t("Navigation background");
        case "navText": return t("Navigation text");
        case "navActiveBackground": return t("Open page background");
        case "navActiveText": return t("Open page text");
        case "headerBackground": return t("Public bar background");
        case "headerText": return t("Public bar text");
    }
}

/** The families a theme may name without a face of its own behind it. */
const GENERIC = ["system-ui", "sans-serif", "serif", "monospace"];

interface Props {
    busy: boolean;
    run: (operation: () => Promise<unknown>) => Promise<void>;
    store: (bytes: Blob, name: string) => Promise<{ id: string }>;
}

export default function AppearancePanel({ busy, run, store }: Props) {
    const { t } = useTranslation();
    const call = useApiCall();
    const { instance } = useInstance();

    const [draft, setDraft] = useState<ThemeInput>(() => draftOf(instance.theme));
    const [fonts, setFonts] = useState<string[]>([]);

    // The provider holds the answer and replaces it whenever anybody changes it,
    // this screen included. The draft follows rather than drifting from it.
    useEffect(() => { setDraft(draftOf(instance.theme)); }, [instance.theme]);

    useApiEffect(async api => { setFonts(await api.managerApi.getInstanceFonts()); }, [instance]);

    const colour = (scheme: "light" | "dark", key: keyof ThemeColours) =>
        (draft[scheme] ?? {})[key] ?? "";

    const setColour = (scheme: "light" | "dark", key: keyof ThemeColours, value: string) =>
        setDraft({ ...draft, [scheme]: { ...(draft[scheme] ?? {}), [key]: value } });

    const families = [...GENERIC, ...new Set(fonts.map(name => name).filter(Boolean))];
    const declared = [...new Set((draft.fonts ?? []).map(face => face.family))];

    return (
        <Stack gap="md">
            <Alert color="gray" p="xs">
                <Text size="sm">
                    {t("Every colour here is optional. A field left empty is the colour AlgoJudge ships, so clearing one is how it is undone. Sizes, spacing and rounding are the product's and are not set here.")}
                </Text>
            </Alert>

            <Card withBorder radius="sm">
                <Stack gap="lg">
                    {GROUPS.map(group => (
                        <Stack gap="xs" key={group.id}>
                            <Stack gap={2}>
                                <Title order={5}>{groupTitle(group.id, t)}</Title>
                                <Text size="xs" c="dimmed">{groupHint(group.id, t)}</Text>
                            </Stack>
                            <Grid gap="xs">
                                {group.fields.map(field => (
                                    <Grid.Col span={{ base: 12, sm: 6 }} key={field}>
                                        <Group gap="xs" grow wrap="nowrap">
                                            <ColorInput
                                                data-testid={`theme-light-${field}`}
                                                label={`${fieldLabel(field, t)} — ${t("light")}`}
                                                format="hex"
                                                // Otherwise an emptied field is
                                                // filled back in with black, and
                                                // "clear it to undo it" stops
                                                // being true.
                                                fixOnBlur={false}
                                                value={colour("light", field)}
                                                onChange={value => setColour("light", field, value)}
                                            />
                                            <ColorInput
                                                data-testid={`theme-dark-${field}`}
                                                label={`${fieldLabel(field, t)} — ${t("dark")}`}
                                                format="hex"
                                                fixOnBlur={false}
                                                value={colour("dark", field)}
                                                onChange={value => setColour("dark", field, value)}
                                            />
                                        </Group>
                                    </Grid.Col>
                                ))}
                            </Grid>
                        </Stack>
                    ))}

                    <Divider />

                    <Stack gap="xs">
                        <Stack gap={2}>
                            <Title order={5}>{t("Typeface")}</Title>
                            <Text size="xs" c="dimmed">
                                {t("A family this installation has not stored resolves to whatever the reader's machine happens to have, so only the generic names and the faces uploaded below can be chosen.")}
                            </Text>
                        </Stack>
                        <Group grow align="flex-start">
                            <Select
                                data-testid="theme-font-family"
                                label={t("Body")}
                                clearable
                                data={[...new Set([...families, ...declared])]}
                                value={draft.fontFamily ?? null}
                                onChange={value => setDraft({ ...draft, fontFamily: value ?? undefined })}
                            />
                            <Select
                                data-testid="theme-font-headings"
                                label={t("Headings")}
                                clearable
                                data={[...new Set([...families, ...declared])]}
                                value={draft.fontFamilyHeadings ?? null}
                                onChange={value => setDraft({ ...draft, fontFamilyHeadings: value ?? undefined })}
                            />
                        </Group>
                    </Stack>

                    <Group justify="space-between">
                        <Group gap="xs">
                            <FileButton
                                accept=".yml,.yaml,application/yaml,text/yaml"
                                onChange={file => {
                                    if (!file) return;
                                    void run(async () => {
                                        const stored = await store(file, "theme.yml");
                                        await call(api => api.managerApi.setInstanceTheme({ fileId: stored.id }));
                                    });
                                }}
                            >
                                {props => (
                                    <Button {...props} variant="light" size="compact-sm" loading={busy}
                                        leftSection={<IconUpload size={14} />}>
                                        {t("Import a theme file")}
                                    </Button>
                                )}
                            </FileButton>
                            {instance.theme && (
                                <Anchor
                                    href={`/api/v1/files/${instance.theme.fileId}`}
                                    download="theme.yml"
                                    size="sm"
                                    data-testid="theme-download"
                                >
                                    <Group gap={4}><IconDownload size={14} />{t("Download it")}</Group>
                                </Anchor>
                            )}
                        </Group>
                        <Group gap="xs">
                            {instance.theme && (
                                <Button
                                    data-testid="theme-clear"
                                    variant="light"
                                    color="red"
                                    loading={busy}
                                    onClick={() => void run(() => call(api => api.managerApi.clearInstanceTheme()))}
                                >
                                    {t("Withdraw the theme")}
                                </Button>
                            )}
                            <Button
                                data-testid="save"
                                loading={busy}
                                onClick={() => void run(() =>
                                    call(api => api.managerApi.setInstanceTheme({ theme: draft })))}
                            >
                                {t("Save")}
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </Card>

            <FacesCard busy={busy} run={run} store={store} fonts={fonts} draft={draft} setDraft={setDraft} />
        </Stack>
    );
}

/**
 * The faces, uploaded and then declared.
 *
 * Two steps rather than one, because they are two facts: a file is stored, and
 * a theme says what to draw with it. A face uploaded and not declared costs
 * nothing and is what an operator has before they have chosen the weights.
 */
function FacesCard({ busy, run, store, fonts, draft, setDraft }: Props & {
    fonts: string[];
    draft: ThemeInput;
    setDraft: (draft: ThemeInput) => void;
}) {
    const { t } = useTranslation();
    const call = useApiCall();
    const [family, setFamily] = useState("");

    const declaredOf = (name: string) => (draft.fonts ?? []).find(face => face.file === name);

    return (
        <Card withBorder radius="sm">
            <Stack gap="sm">
                <Stack gap={2}>
                    <Title order={5}>{t("Faces")}</Title>
                    <Text size="xs" c="dimmed">
                        {t("WOFF2 only, and this installation serves them itself — nothing is fetched from anybody else's server. Name the family a face belongs to, then choose it above.")}
                    </Text>
                </Stack>

                {fonts.length === 0 && (
                    <Text size="sm" c="dimmed">{t("No face has been uploaded.")}</Text>
                )}

                {fonts.map(name => {
                    const face = declaredOf(name);
                    return (
                        <Group key={name} justify="space-between" wrap="nowrap">
                            <Stack gap={0}>
                                <Text size="sm" ff="monospace">{name}</Text>
                                <Text size="xs" c="dimmed">
                                    {face ? `${face.family} · ${face.weight ?? 400} · ${face.style ?? "normal"}` : t("not used by the theme")}
                                </Text>
                            </Stack>
                            <Group gap="xs">
                                {!face && (
                                    <Button
                                        variant="light"
                                        size="compact-sm"
                                        disabled={family.trim().length === 0}
                                        onClick={() => setDraft({
                                            ...draft,
                                            fonts: [...(draft.fonts ?? []), {
                                                family: family.trim(),
                                                file: name,
                                                weight: weightOf(name),
                                                style: name.includes("italic") ? "italic" : "normal",
                                            }],
                                        })}
                                    >
                                        {t("Use it")}
                                    </Button>
                                )}
                                <Tooltip label={t("Remove")}>
                                    <Button
                                        variant="light"
                                        color="red"
                                        size="compact-sm"
                                        loading={busy}
                                        onClick={() => void run(() =>
                                            call(api => api.managerApi.removeInstanceFont(name)))}
                                    >
                                        <IconTrash size={14} />
                                    </Button>
                                </Tooltip>
                            </Group>
                        </Group>
                    );
                })}

                <Divider />

                <Group align="flex-end" gap="sm">
                    <Select
                        label={t("Family this face belongs to")}
                        description={t("A weight and a style are read from the file name where it says so — example-700-italic.woff2.")}
                        data={[...new Set((draft.fonts ?? []).map(face => face.family))]}
                        searchable
                        // A family nobody has used yet has to be typeable: the
                        // first face of a family is the case this exists for.
                        allowDeselect={false}
                        value={family || null}
                        onChange={value => setFamily(value ?? "")}
                        onSearchChange={setFamily}
                        style={{ flex: 1 }}
                    />
                    <FileButton
                        accept=".woff2,font/woff2"
                        onChange={file => {
                            if (!file) return;
                            void run(async () => {
                                const stored = await store(file, file.name);
                                await call(api => api.managerApi.addInstanceFont({
                                    fileId: stored.id,
                                    name: file.name,
                                }));
                            });
                        }}
                    >
                        {props => (
                            <Button {...props} variant="light" loading={busy}
                                leftSection={<IconUpload size={14} />}>
                                {t("Upload a face")}
                            </Button>
                        )}
                    </FileButton>
                </Group>
            </Stack>
        </Card>
    );
}

/** `example-700.woff2` is 700; anything that does not say so is 400. */
function weightOf(name: string): number {
    const match = /(?:^|[^0-9])([1-9]00)(?:[^0-9]|$)/.exec(name);
    return match ? Number(match[1]) : 400;
}

/** What the form starts from: the theme in force, or nothing. */
function draftOf(theme: { light?: ThemeColours; dark?: ThemeColours; fontFamily?: string; fontFamilyHeadings?: string; fonts: { name: string; family: string; weight: number; style: string }[] } | undefined): ThemeInput {
    if (!theme) return {};
    return {
        light: { ...theme.light },
        dark: { ...theme.dark },
        fontFamily: theme.fontFamily,
        fontFamilyHeadings: theme.fontFamilyHeadings,
        fonts: theme.fonts.map(face => ({
            family: face.family,
            file: face.name,
            weight: face.weight,
            style: face.style,
        })),
    };
}
