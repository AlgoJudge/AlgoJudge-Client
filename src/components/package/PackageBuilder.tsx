import {
    Alert, Badge, Button, Card, Code, Grid, Group, Modal, NumberInput, ScrollArea, Select, Stack, Switch,
    Table, Text, Textarea, TextInput, Title, Tooltip,
} from "@mantine/core";
import {
    IconAlertTriangle, IconCheck, IconCopy, IconDownload, IconEye, IconFileZip, IconInfoCircle, IconPlus,
    IconTrash, IconUpload,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildPackage, buildSampleArchive, ExtraFile, readPackage } from "../../package/build";
import { groupsOf, intakeFiles } from "../../package/intake";
import { emptyConfig, KIB_PER_MIB, PackageConfig, PackageGroup, PackageLimits, TestFile } from "../../package/types";
import { hasErrors, validatePackage } from "../../package/validate";
import { CopyButton, DownloadButton } from "../buttons";
import CodeHighlight from "../codehighlight/CodeHighlight";

/**
 * Assembles a Runner package from loose files.
 *
 * The archive is built in the browser rather than on the Server, because its
 * layout is a property of the problem type and the Server is not allowed to know
 * one type from another.
 *
 * Nothing here uploads. A package belongs to a version, and a version is
 * published whole — so the builder hands what is on screen up to the editor,
 * which sends it together with the statement and the attachments.
 */
export interface PackageBuilderProps {
    /**
     * What is stored for this version, if anything. Shown before the form: the
     * first question a manager has is whether there is a package at all, and the
     * second is whether it is the one they meant.
     */
    stored?: { sizeBytes: number; sha256: string };
    /** Fetches the stored archive. Opened on arrival, so the tab shows it. */
    onOpenStored?: () => Promise<Blob | undefined>;
    /** Reports the draft, or undefined while the screen matches what is stored. */
    onDraftChange?: (draft: PackageDraft | undefined) => void;
    disabled?: boolean;
}

export interface PackageDraft {
    /** Assembles what is on screen. Called once, when the version is published. */
    build: () => Promise<Blob>;
    /** Whether the validator refuses it. Publishing waits until it does not. */
    blocked: boolean;
}

const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
};

interface UnitOption {
    label: string;
    factor: number;
}

// Coarsest last. `config.yml` holds milliseconds and kibibytes — the units
// `sinolpack` holds, so an import is a copy rather than a division with a
// rounding rule — but nobody says "262144 kibibytes" or "1000 milliseconds".
const TIME_UNITS: UnitOption[] = [{ label: "ms", factor: 1 }, { label: "s", factor: 1000 }];
const MEMORY_UNITS: UnitOption[] = [{ label: "KiB", factor: 1 }, { label: "MiB", factor: KIB_PER_MIB }];

/** The coarsest unit the value is a whole number of. */
const fittingUnit = (units: UnitOption[], value: number | undefined): UnitOption =>
    [...units].reverse().find(u => value === undefined || value % u.factor === 0) ?? units[0];

/**
 * A limit, entered in the unit a person is thinking in and stored in the unit
 * the file speaks.
 *
 * The unit follows the value when the value arrives from outside — opening a
 * package with a 1500 ms limit puts the field in milliseconds — but not while
 * somebody is typing, or the field would move under the caret.
 */
const UnitInput = ({ label, units, value, placeholder, onChange, w }: {
    label?: string;
    units: UnitOption[];
    value: number | undefined;
    placeholder?: number;
    onChange: (value: number | undefined) => void;
    w?: number;
}) => {
    const [unit, setUnit] = useState<UnitOption>(() => fittingUnit(units, value));
    const emitted = useRef(value);

    useEffect(() => {
        if (value === emitted.current) return;
        emitted.current = value;
        setUnit(fittingUnit(units, value));
    }, [units, value]);

    const shown = units.find(u => u.label === unit.label) ?? units[0];

    return (
        <Group gap={4} align="flex-end" wrap="nowrap">
            <NumberInput
                label={label}
                min={1}
                w={w ?? 130}
                placeholder={placeholder === undefined ? undefined : `${placeholder / shown.factor}`}
                value={value === undefined ? "" : value / shown.factor}
                onChange={v => {
                    const parsed = typeof v === "number" ? v : Number(v);
                    const next = Number.isFinite(parsed) && parsed > 0
                        ? Math.round(parsed * shown.factor)
                        : undefined;
                    emitted.current = next;
                    onChange(next);
                }}
            />
            <Select
                data={units.map(u => u.label)}
                value={shown.label}
                onChange={next => {
                    const chosen = units.find(u => u.label === next);
                    if (chosen) setUnit(chosen);
                }}
                w={80}
                allowDeselect={false}
            />
        </Group>
    );
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** The first name free in a group: `a`, then `b`, and `aa` once `z` is taken. */
const nextLetter = (used: Set<string>): string => {
    for (const first of LETTERS) if (!used.has(first)) return first;
    for (const first of LETTERS) for (const second of LETTERS) {
        if (!used.has(first + second)) return first + second;
    }
    return "";
};

const encoder = new TextEncoder();
const sizeOf = (text: string | undefined): number => text === undefined ? 0 : encoder.encode(text).length;
const humanSize = (bytes: number): string => bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} kB`;

/** Enough of a file to recognise it. Reading a megabyte of tests is not the point. */
const PREVIEW_LIMIT = 20000;

interface PreviewFile {
    name: string;
    content: string;
    language?: string;
}

export default function PackageBuilder({ stored, onOpenStored, onDraftChange, disabled }: PackageBuilderProps) {
    const { t } = useTranslation();
    const filesInput = useRef<HTMLInputElement>(null);
    const packageInput = useRef<HTMLInputElement>(null);
    const checkerInput = useRef<HTMLInputElement>(null);
    const modelInput = useRef<HTMLInputElement>(null);

    const [tests, setTests] = useState<TestFile[]>([]);
    const [checker, setChecker] = useState<ExtraFile | undefined>(undefined);
    const [modelSolution, setModelSolution] = useState<ExtraFile | undefined>(undefined);
    const [unrecognised, setUnrecognised] = useState<string[]>([]);
    const [opened, setOpened] = useState(false);
    const [config, setConfig] = useState<PackageConfig>(emptyConfig());
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    // Whether the screen still says what is stored. Publishing sends the package
    // only when it does not, so republishing a statement does not rebuild an
    // archive nobody touched.
    const [touched, setTouched] = useState(false);
    const [preview, setPreview] = useState<PreviewFile[] | undefined>(undefined);
    const [adding, setAdding] = useState<{ group: number; letter: string; input: string; output: string } | undefined>(undefined);

    // Groups follow the tests: a group with no tests is points nobody can earn,
    // and a test outside every group is a test nobody is scored on.
    useEffect(() => {
        const present = groupsOf(tests);
        setConfig(current => {
            const kept = current.groups.filter(g => present.includes(g.group));
            const added = present
                .filter(g => !kept.some(k => k.group === g))
                .map((g): PackageGroup => ({ group: g, points: 0, examples: g === 0 || undefined }));
            return { ...current, groups: [...kept, ...added].sort((a, b) => a.group - b.group) };
        });
    }, [tests]);

    const fileNames = useMemo(() => [
        ...tests.flatMap(t => t.output === undefined ? [`${t.name}.in`] : [`${t.name}.in`, `${t.name}.out`]),
        ...(checker ? [checker.name] : []),
        ...(modelSolution ? [modelSolution.name] : []),
    ], [tests, checker, modelSolution]);

    const configWithPrograms = useMemo((): PackageConfig => ({
        ...config,
        checker: checker ? { source: `checker/${checker.name}`, language: languageOf(checker.name) } : undefined,
        modelSolution: modelSolution ? { source: `solutions/${modelSolution.name}`, language: languageOf(modelSolution.name) } : undefined,
    }), [config, checker, modelSolution]);

    const issues = useMemo(
        () => validatePackage(tests, configWithPrograms, fileNames),
        [tests, configWithPrograms, fileNames]
    );
    const blocked = hasErrors(issues);

    const build = useCallback(
        () => buildPackage({ config: configWithPrograms, tests, checker, modelSolution }),
        [configWithPrograms, tests, checker, modelSolution]);

    // What the editor publishes. Reported rather than uploaded: a package cannot
    // be added to a version that already exists.
    useEffect(() => {
        onDraftChange?.(touched && !disabled ? { build, blocked } : undefined);
    }, [touched, disabled, build, blocked, onDraftChange]);

    const guard = async (operation: () => Promise<void>) => {
        setError(undefined);
        setBusy(true);
        try {
            await operation();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const take = (files: FileList | null) => guard(async () => {
        if (!files || files.length === 0) return;
        const intake = await intakeFiles([...files]);
        // Added to what is on screen rather than replacing it: tests usually
        // arrive in batches, and a second drop should not discard the first.
        setTests(current => [
            ...current.filter(existing => !intake.tests.some(t => t.name === existing.name)),
            ...intake.tests,
        ].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
        if (intake.checker) setChecker(intake.checker);
        if (intake.modelSolution) setModelSolution(intake.modelSolution);
        setUnrecognised(intake.unrecognised);
        setTouched(true);
    });

    const openArchive = async (archive: Blob) => {
        // A built package can be downloaded, corrected by hand and brought back:
        // the builder assembles the format, it does not own it.
        const contents = await readPackage(archive);
        setConfig(contents.config);
        setTests(contents.tests);
        setChecker(contents.checker);
        setModelSolution(contents.modelSolution);
        setUnrecognised([]);
    };

    const openExisting = (file: File | undefined) => guard(async () => {
        if (!file) return;
        await openArchive(file);
        setTouched(true);
    });

    /**
     * Opens what the version already holds.
     *
     * Called on arrival as well as from the button: the tab exists to show the
     * package, and a screen that says "there is one" while showing an empty form
     * makes a manager click to find out what is in it.
     */
    const openStored = useCallback(() => guard(async () => {
        if (!onOpenStored) return;
        const archive = await onOpenStored();
        if (!archive) {
            setError(t("There is no package to open"));
            return;
        }
        await openArchive(archive);
        setOpened(true);
        // Opening what is stored is not an edit: the screen now says exactly
        // what the version says.
        setTouched(false);
    }), [onOpenStored, t]);

    const autoOpened = useRef(false);
    useEffect(() => {
        if (autoOpened.current || !stored || !onOpenStored) return;
        autoOpened.current = true;
        void openStored();
    }, [stored, onOpenStored, openStored]);

    const setGroup = (group: number, patch: Partial<PackageGroup>) => {
        setTouched(true);
        setConfig(c => ({ ...c, groups: c.groups.map(g => g.group === group ? { ...g, ...patch } : g) }));
    };

    /**
     * Sets or clears one of a group's own limits.
     *
     * An emptied field removes the override rather than storing zero: "inherit"
     * and "no time at all" must not be the same value, and a group left with an
     * empty `limits` object would serialise as one in `config.yml`.
     */
    const setGroupLimit = (group: number, key: keyof PackageLimits, value: number | undefined) => {
        setTouched(true);
        setConfig(c => ({
            ...c,
            groups: c.groups.map(g => {
                if (g.group !== group) return g;
                const limits = { ...g.limits };
                if (value === undefined || value <= 0) delete limits[key];
                else limits[key] = value;
                return { ...g, limits: Object.keys(limits).length > 0 ? limits : undefined };
            }),
        }));
    };

    const setLimit = (key: keyof PackageLimits, value: number | undefined) => {
        setTouched(true);
        setConfig(c => ({ ...c, limits: { ...c.limits, [key]: value ?? 0 } }));
    };

    const removeTest = (name: string) => {
        setTouched(true);
        setTests(current => current.filter(test => test.name !== name));
    };

    const addTest = () => {
        if (!adding) return;
        const letter = adding.letter.trim().toLowerCase();
        const name = `${adding.group}${letter}`;
        if (!/^[a-z]+$/.test(letter)) {
            setError(t("A test letter is one or more letters, without a number"));
            return;
        }
        if (tests.some(test => test.name === name)) {
            setError(t("This package already has a test called") + ` ${name}`);
            return;
        }
        setTouched(true);
        setTests(current => [...current, {
            name,
            group: adding.group,
            letter,
            input: adding.input,
            // An empty output means a checker decides; storing "" would write an
            // empty `.out` file and make every answer wrong.
            output: adding.output.length > 0 ? adding.output : undefined,
        }].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
        setAdding(undefined);
        setError(undefined);
    };

    const takeProgram = (file: File | undefined, set: (extra: ExtraFile) => void) => guard(async () => {
        if (!file) return;
        set({ name: file.name, content: await file.text() });
        setTouched(true);
    });

    const exampleTests = tests.filter(t => configWithPrograms.groups.find(g => g.group === t.group)?.examples);
    const sizes = useMemo(() => new Map(tests.map(test =>
        [test.name, { input: sizeOf(test.input), output: sizeOf(test.output) }])), [tests]);

    const programRow = (
        label: string,
        program: ExtraFile | undefined,
        pick: () => void,
        clear: () => void,
        empty: string,
    ) => (
        <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
                <Text size="sm">{label}</Text>
                {program
                    ? <><Code>{program.name}</Code><Badge size="sm" variant="light">{languageOf(program.name)}</Badge></>
                    : <Text size="sm" c="dimmed">{empty}</Text>}
            </Group>
            <Group gap="xs" wrap="nowrap">
                {program && (
                    <Button
                        variant="subtle"
                        size="compact-sm"
                        leftSection={<IconEye size={14} />}
                        onClick={() => setPreview([{
                            name: program.name,
                            content: program.content,
                            language: languageOf(program.name),
                        }])}
                    >
                        {t("Preview")}
                    </Button>
                )}
                <Button
                    variant="light"
                    size="compact-sm"
                    leftSection={<IconUpload size={14} />}
                    disabled={disabled}
                    onClick={pick}
                >
                    {program ? t("Replace") : t("Attach")}
                </Button>
                {program && (
                    <Button variant="subtle" color="red" size="compact-sm" disabled={disabled} onClick={clear}>
                        <IconTrash size={14} />
                    </Button>
                )}
            </Group>
        </Group>
    );

    return (
        <Stack gap="md">
            {/* The state of the version's package, before anything about
                building a new one: nothing else on this screen answers "is this
                problem ready to be judged". */}
            <Card withBorder radius="sm">
                <Group justify="space-between" wrap="wrap">
                    <Group gap="sm">
                        {stored
                            ? <Badge color="teal" variant="light" leftSection={<IconFileZip size={12} />}>{t("Package uploaded")}</Badge>
                            : <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />}>{t("No package")}</Badge>}
                        {stored && (
                            <Text size="sm" c="dimmed">
                                {Math.max(1, Math.ceil(stored.sizeBytes / 1024))} kB ·{" "}
                                <Text component="span" ff="monospace" fz="xs">sha256 {stored.sha256.slice(0, 16)}…</Text>
                            </Text>
                        )}
                        {!stored && (
                            <Text size="sm" c="dimmed">{t("Nothing can be judged until a package is published.")}</Text>
                        )}
                    </Group>
                    <Group gap="xs">
                        <Button
                            variant="light"
                            size="compact-sm"
                            leftSection={<IconDownload size={14} />}
                            disabled={!stored || !onOpenStored}
                            loading={busy}
                            onClick={async () => {
                                const archive = await onOpenStored?.();
                                if (archive) download(archive, "package.zip");
                            }}
                        >
                            {t("Download")}
                        </Button>
                        <Button
                            variant="light"
                            size="compact-sm"
                            leftSection={<IconFileZip size={14} />}
                            disabled={!stored || !onOpenStored}
                            loading={busy}
                            onClick={openStored}
                        >
                            {t("Reopen the stored package")}
                        </Button>
                    </Group>
                </Group>
                {opened && !touched && (
                    <Alert color="blue" mt="sm" p="xs">
                        <Text size="sm">{t("This is the package stored for the version shown.")}</Text>
                    </Alert>
                )}
                {touched && (
                    <Alert color="yellow" mt="sm" p="xs" icon={<IconInfoCircle size={16} />}>
                        <Text size="sm">
                            {t("Changed. A package cannot be added to a version that exists, so it is published with the next one.")}
                        </Text>
                    </Alert>
                )}
            </Card>

            <Group gap="xs" wrap="wrap">
                <Button variant="light" leftSection={<IconUpload size={16} />} disabled={disabled} onClick={() => filesInput.current?.click()} loading={busy}>
                    {t("Add test files")}
                </Button>
                <Button variant="light" leftSection={<IconFileZip size={16} />} disabled={disabled} onClick={() => packageInput.current?.click()} loading={busy}>
                    {t("Open an existing package")}
                </Button>
                <input ref={filesInput} type="file" multiple style={{ display: "none" }}
                    onChange={e => { take(e.currentTarget.files); e.currentTarget.value = ""; }} />
                <input ref={packageInput} type="file" accept=".zip" style={{ display: "none" }}
                    onChange={e => { openExisting(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
            </Group>

            <Alert color="blue" icon={<IconInfoCircle size={18} />} p="xs">
                <Text size="sm">
                    {t("Files are paired by name: 1a.in goes with 1a.out. The number is the group, the letter the test.")}
                </Text>
            </Alert>

            {error && <Alert color="red" withCloseButton onClose={() => setError(undefined)}>{error}</Alert>}

            {issues.length > 0 && (
                <Stack gap={4}>
                    {issues.map((issue, i) => (
                        <Alert
                            key={i}
                            color={issue.level === "error" ? "red" : "yellow"}
                            icon={<IconAlertTriangle size={16} />}
                            p="xs"
                        >
                            <Text size="sm">{issue.file ? `${issue.file}: ` : ""}{issue.message}</Text>
                        </Alert>
                    ))}
                </Stack>
            )}
            {tests.length > 0 && issues.length === 0 && (
                <Alert color="teal" icon={<IconCheck size={16} />} p="xs">
                    <Text size="sm">{t("The package is ready")}</Text>
                </Alert>
            )}

            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Default limits")}</Title>
                <Group>
                    <UnitInput
                        label={t("Time limit")}
                        units={TIME_UNITS}
                        value={config.limits.timeMs}
                        w={160}
                        onChange={ms => setLimit("timeMs", ms)}
                    />
                    <UnitInput
                        label={t("Memory limit")}
                        units={MEMORY_UNITS}
                        value={config.limits.memoryKib}
                        w={160}
                        onChange={kib => setLimit("memoryKib", kib)}
                    />
                </Group>
                <Text size="xs" c="dimmed" mt="xs">
                    {t("Every test uses these unless its group says otherwise.")}
                </Text>
            </Card>

            <Card withBorder radius="sm">
                <Group justify="space-between" mb="sm">
                    <Title order={5}>{t("Tests")} ({tests.length})</Title>
                    <Button
                        variant="light"
                        size="compact-sm"
                        leftSection={<IconPlus size={14} />}
                        disabled={disabled}
                        onClick={() => {
                            // The group being worked on is the last one there is;
                            // the letter, the first one free in it.
                            const groups = groupsOf(tests);
                            const group = groups.length > 0 ? groups[groups.length - 1] : 1;
                            setAdding({
                                group,
                                letter: nextLetter(new Set(tests
                                    .filter(test => test.group === group)
                                    .map(test => test.letter))),
                                input: "",
                                output: "",
                            });
                        }}
                    >
                        {t("Add a test")}
                    </Button>
                </Group>
                {tests.length === 0 ? (
                    <Text size="sm" c="dimmed">{t("No tests yet")}</Text>
                ) : (
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t("Test")}</Table.Th>
                                <Table.Th>{t("Group")}</Table.Th>
                                <Table.Th>{t("Input")}</Table.Th>
                                <Table.Th>{t("Output")}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {tests.map(test => (
                                <Table.Tr key={test.name}>
                                    <Table.Td><Text size="sm" ff="monospace">{test.name}</Text></Table.Td>
                                    <Table.Td><Text size="sm">{test.group}</Text></Table.Td>
                                    <Table.Td><Text size="sm" c="dimmed">{humanSize(sizes.get(test.name)?.input ?? 0)}</Text></Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {test.output === undefined
                                                ? t("checker")
                                                : humanSize(sizes.get(test.name)?.output ?? 0)}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                            <Tooltip label={t("Preview")}>
                                                <Button
                                                    variant="subtle"
                                                    size="compact-sm"
                                                    onClick={() => setPreview([
                                                        { name: `${test.name}.in`, content: test.input },
                                                        ...(test.output === undefined
                                                            ? []
                                                            : [{ name: `${test.name}.out`, content: test.output }]),
                                                    ])}
                                                >
                                                    <IconEye size={14} />
                                                </Button>
                                            </Tooltip>
                                            <Tooltip label={t("Delete")}>
                                                <Button
                                                    variant="subtle"
                                                    color="red"
                                                    size="compact-sm"
                                                    disabled={disabled}
                                                    onClick={() => removeTest(test.name)}
                                                >
                                                    <IconTrash size={14} />
                                                </Button>
                                            </Tooltip>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                )}
            </Card>

            {configWithPrograms.groups.length > 0 && (
                <Card withBorder radius="sm">
                    <Title order={5} mb="sm">{t("Groups")}</Title>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t("Group")}</Table.Th>
                                <Table.Th>{t("Tests")}</Table.Th>
                                <Table.Th>{t("Points")}</Table.Th>
                                <Table.Th>{t("Time limit")}</Table.Th>
                                <Table.Th>{t("Memory limit")}</Table.Th>
                                <Table.Th>{t("Examples")}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {configWithPrograms.groups.map(group => (
                                <Table.Tr key={group.group}>
                                    <Table.Td><Text fw={500}>{group.group}</Text></Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {tests.filter(t => t.group === group.group).length}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <NumberInput
                                            min={0}
                                            w={110}
                                            disabled={disabled}
                                            value={group.points}
                                            onChange={v => setGroup(group.group, { points: Number(v) || 0 })}
                                        />
                                    </Table.Td>
                                    {/* Empty inherits the limits above. A group of
                                        harder tests may need more time than the rest,
                                        and saying so per group beats raising the limit
                                        for every test in the problem. */}
                                    <Table.Td>
                                        <UnitInput
                                            units={TIME_UNITS}
                                            value={group.limits?.timeMs}
                                            placeholder={config.limits.timeMs}
                                            onChange={ms => setGroupLimit(group.group, "timeMs", ms)}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <UnitInput
                                            units={MEMORY_UNITS}
                                            value={group.limits?.memoryKib}
                                            placeholder={config.limits.memoryKib}
                                            onChange={kib => setGroupLimit(group.group, "memoryKib", kib)}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        {/* Marked rather than inferred: "shown in the
                                            statement" and "worth nothing" are two
                                            different properties that group 0 happens
                                            to combine. */}
                                        <Switch
                                            checked={!!group.examples}
                                            disabled={disabled}
                                            onChange={e => setGroup(group.group, { examples: e.currentTarget.checked || undefined })}
                                        />
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Card>
            )}

            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Programs")}</Title>
                <Stack gap="xs">
                    {programRow(
                        t("Checker"), checker,
                        () => checkerInput.current?.click(),
                        () => { setChecker(undefined); setTouched(true); },
                        t("None — the .out files decide"))}
                    {programRow(
                        t("Model solution"), modelSolution,
                        () => modelInput.current?.click(),
                        () => { setModelSolution(undefined); setTouched(true); },
                        t("None — limits cannot be calibrated"))}
                    <input ref={checkerInput} type="file" accept=".cpp,.cc,.c,.py,.java,.rs,.go,.pas" style={{ display: "none" }}
                        onChange={e => { takeProgram(e.currentTarget.files?.[0], setChecker); e.currentTarget.value = ""; }} />
                    <input ref={modelInput} type="file" accept=".cpp,.cc,.c,.py,.java,.rs,.go,.pas" style={{ display: "none" }}
                        onChange={e => { takeProgram(e.currentTarget.files?.[0], setModelSolution); e.currentTarget.value = ""; }} />
                </Stack>
                <Text size="xs" c="dimmed" mt="xs">
                    {t("The model solution is used to calibrate limits, never to judge.")}
                </Text>
            </Card>

            {unrecognised.length > 0 && (
                <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title={t("Ignored files")}>
                    <Text size="sm">{unrecognised.join(", ")}</Text>
                </Alert>
            )}

            <Group gap="xs">
                <Button
                    variant="light"
                    leftSection={<IconDownload size={16} />}
                    disabled={tests.length === 0}
                    loading={busy}
                    onClick={() => guard(async () => download(await build(), "package.zip"))}
                >
                    {t("Download the package")}
                </Button>
                <Button
                    variant="subtle"
                    leftSection={<IconDownload size={16} />}
                    disabled={exampleTests.length === 0}
                    onClick={async () => download(await buildSampleArchive(exampleTests), "examples.zip")}
                >
                    {t("Download the samples")}
                </Button>
            </Group>

            <Modal
                opened={preview !== undefined}
                onClose={() => setPreview(undefined)}
                title={preview?.map(file => file.name).join(" · ")}
                size="xl"
            >
                <Grid>
                    {(preview ?? []).map(file => (
                        <Grid.Col key={file.name} span={{ base: 12, md: preview!.length > 1 ? 6 : 12 }}>
                            <Stack gap="xs">
                                <Group justify="space-between" wrap="nowrap">
                                    <Text size="sm" ff="monospace">{file.name}</Text>
                                    <Group gap={4} wrap="nowrap">
                                        <CopyButton value={file.content}>
                                            {({ copied, copy }) => (
                                                <Tooltip label={t("Copy")}>
                                                    <Button variant="subtle" size="compact-sm" onClick={copy}>
                                                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                    </Button>
                                                </Tooltip>
                                            )}
                                        </CopyButton>
                                        {/* One button per file rather than one for the
                                            pair: a manager checking an output does not
                                            want the input in their downloads. */}
                                        <DownloadButton
                                            file={new Blob([file.content], { type: "text/plain" })}
                                            filename={file.name}
                                        >
                                            {({ download: save }) => (
                                                <Tooltip label={`${t("Download")} ${file.name}`}>
                                                    <Button variant="subtle" size="compact-sm" onClick={save}>
                                                        <IconDownload size={14} />
                                                    </Button>
                                                </Tooltip>
                                            )}
                                        </DownloadButton>
                                    </Group>
                                </Group>
                                <ScrollArea.Autosize mah={400}>
                                    {/* Test data is data: it gets no syntax colours,
                                        because there is no syntax. A checker is
                                        source, and reads as source. */}
                                    {file.language === undefined
                                        ? <Code block style={{ fontSize: 12 }}>{file.content.slice(0, PREVIEW_LIMIT)}</Code>
                                        : <CodeHighlight code={file.content.slice(0, PREVIEW_LIMIT)} language={file.language} />}
                                </ScrollArea.Autosize>
                                <Text size="xs" c="dimmed">
                                    {humanSize(sizeOf(file.content))}
                                    {file.content.length > PREVIEW_LIMIT && ` · ${t("shown truncated")}`}
                                </Text>
                            </Stack>
                        </Grid.Col>
                    ))}
                </Grid>
            </Modal>

            <Modal opened={adding !== undefined} onClose={() => setAdding(undefined)} title={t("Add a test")} size="lg">
                {adding && (
                    <Stack gap="sm">
                        <Group grow>
                            <NumberInput
                                label={t("Group")}
                                min={0}
                                value={adding.group}
                                onChange={v => setAdding({ ...adding, group: Number(v) || 0 })}
                            />
                            <TextInput
                                label={t("Letter")}
                                value={adding.letter}
                                onChange={e => setAdding({ ...adding, letter: e.currentTarget.value })}
                            />
                        </Group>
                        <Text size="sm" c="dimmed">
                            {t("The test will be called")} <Code>{`${adding.group}${adding.letter.trim().toLowerCase()}`}</Code>
                        </Text>
                        <Textarea
                            label={t("Input")}
                            autosize
                            minRows={6}
                            maxRows={14}
                            spellCheck={false}
                            styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
                            value={adding.input}
                            onChange={e => setAdding({ ...adding, input: e.currentTarget.value })}
                        />
                        <Textarea
                            label={t("Output")}
                            description={t("Leave empty when a checker decides the verdict")}
                            autosize
                            minRows={4}
                            maxRows={14}
                            spellCheck={false}
                            styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
                            value={adding.output}
                            onChange={e => setAdding({ ...adding, output: e.currentTarget.value })}
                        />
                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setAdding(undefined)}>{t("Cancel")}</Button>
                            <Button leftSection={<IconPlus size={16} />} onClick={addTest}>{t("Add a test")}</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}

/** The compiler a program needs, taken from its extension. */
const languageOf = (name: string): string => {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    switch (extension) {
        case "cc":
        case "cpp": return "cpp";
        case "c": return "c";
        case "py": return "python";
        case "java": return "java";
        case "rs": return "rust";
        case "go": return "go";
        case "pas": return "pascal";
        default: return extension;
    }
};
