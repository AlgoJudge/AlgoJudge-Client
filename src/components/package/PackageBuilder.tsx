import {
    Alert, Badge, Button, Card, Code, Grid, Group, Modal, NumberInput, ScrollArea, Select, Stack, Switch,
    Table, Text, Textarea, TextInput, Title, Tooltip,
} from "@mantine/core";
import {
    IconAlertTriangle, IconCheck, IconCopy, IconDownload, IconEye, IconFileZip, IconGauge, IconInfoCircle,
    IconPlus, IconTrash, IconUpload,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildPackage, buildSampleArchive, ExtraFile, readPackage } from "../../package/build";
import { groupsOf, intakeFiles } from "../../package/intake";
import {
    applyCalibration, calibrationRule, EXAMPLE_MEMORY_BYTES, EXAMPLE_TIME_MS, measuredGroups,
    suggestedForGroup,
} from "../../package/calibration";
import {
    BYTES_PER_KIB, BYTES_PER_MIB, CalibrationRule, emptyConfig, PackageConfig, PackageGroup, PackageLimits,
    PackageMeasurement, TestFile,
} from "../../package/types";
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
    /**
     * Runs a trial on what is on screen, and answers with what it measured.
     *
     * The builder assembles the archive and knows nothing else: uploading it,
     * asking for the trial and waiting for it are the page's, because this
     * component has no API and adding one would make a form that draws limits
     * into a form that talks to a Server.
     *
     * Undefined leaves the button disabled, which is what a screen with no
     * activity and no library permission should show.
     */
    onMeasure?: (archive: Blob) => Promise<PackageMeasurement[] | undefined>;
    disabled?: boolean;
}

export interface PackageDraft {
    /** Assembles what is on screen. Called once, when the version is published. */
    build: () => Promise<Blob>;
    /**
     * The example tests, for the participant. Undefined when no group is marked
     * as examples — a problem may legitimately show none.
     */
    buildSamples: () => Promise<Blob | undefined>;
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

// Coarsest last. `config.yml` holds milliseconds and bytes — the units
// `sinolpack` holds, so an import is a copy rather than a division with a
// rounding rule — but nobody says "262144 kibibytes" or "1000 milliseconds".
const TIME_UNITS: UnitOption[] = [{ label: "ms", factor: 1 }, { label: "s", factor: 1000 }];
const MEMORY_UNITS: UnitOption[] = [
    { label: "B", factor: 1 },
    { label: "KiB", factor: BYTES_PER_KIB },
    { label: "MiB", factor: BYTES_PER_MIB },
];

/** The coarsest unit the value is a whole number of. */
const fittingUnit = (units: UnitOption[], value: number | undefined): UnitOption =>
    [...units].reverse().find(u => value === undefined || value % u.factor === 0) ?? units[0];

/** A value written in the coarsest unit that keeps it whole: `48 MiB`, `800 ms`. */
const inUnits = (units: UnitOption[], value: number): string => {
    const unit = fittingUnit(units, value);
    return `${value / unit.factor} ${unit.label}`;
};

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

export default function PackageBuilder(
    { stored, onOpenStored, onDraftChange, onMeasure, disabled }: PackageBuilderProps,
) {
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
    const [measuring, setMeasuring] = useState(false);
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

    const exampleTests = useMemo(
        () => tests.filter(t => configWithPrograms.groups.find(g => g.group === t.group)?.examples),
        [tests, configWithPrograms]);

    const build = useCallback(
        () => buildPackage({ config: configWithPrograms, tests, checker, modelSolution }),
        [configWithPrograms, tests, checker, modelSolution]);

    // The examples travel with the package because they are made from it. The
    // package itself never reaches a participant: it carries every hidden test.
    const buildSamples = useCallback(
        async () => exampleTests.length > 0 ? buildSampleArchive(exampleTests) : undefined,
        [exampleTests]);

    // What the editor publishes. Reported rather than uploaded: a package cannot
    // be added to a version that already exists.
    useEffect(() => {
        onDraftChange?.(touched && !disabled ? { build, buildSamples, blocked } : undefined);
    }, [touched, disabled, build, buildSamples, blocked, onDraftChange]);

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
    /**
     * Writes the suggestion for these groups into their own limits.
     *
     * Per group and never into `limits`, the package-wide default: a suggestion
     * is derived from what one group's tests did, and applying it globally would
     * hand every other group a limit measured on somebody else's work.
     *
     * A field with nothing measured is left alone rather than cleared. Absent
     * memory means the Runner could not measure it honestly, which is not the
     * same as "this group has no memory limit".
     */
    const applySuggestions = (groups: number[]) => {
        for (const group of groups) {
            const limits = suggestedForGroup(config.calibration, group);
            if (limits.timeMs !== undefined) setGroupLimit(group, "timeMs", limits.timeMs);
            if (limits.memoryBytes !== undefined) setGroupLimit(group, "memoryBytes", limits.memoryBytes);
        }
    };

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

    /**
     * Sets one part of a calibration rule.
     *
     * Writing any part writes the whole rule, defaults included: a `config.yml`
     * that states a factor and leaves the rounding implicit would change meaning
     * the day the default changes.
     */
    const setCalibration = (field: "time" | "memory", part: keyof CalibrationRule, value: number | undefined) => {
        setTouched(true);
        setConfig(c => ({
            ...c,
            calibration: {
                ...c.calibration,
                [field]: { ...calibrationRule(c.calibration, field), [part]: value ?? 0 },
            },
        }));
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
                    <Button data-testid="preview"
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
                        {/* Replacing the whole package belongs with the other
                            whole-package actions, not with adding a test. */}
                        <Button
                            variant="light"
                            size="compact-sm"
                            leftSection={<IconUpload size={14} />}
                            disabled={disabled}
                            loading={busy}
                            onClick={() => packageInput.current?.click()}
                        >
                            {t("Open an existing package")}
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

            <input ref={filesInput} type="file" multiple style={{ display: "none" }}
                onChange={e => { take(e.currentTarget.files); e.currentTarget.value = ""; }} />
            <input ref={packageInput} type="file" accept=".zip" style={{ display: "none" }}
                onChange={e => { openExisting(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />

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
                            {/* Translated where it is shown: the validator states
                                findings, the screen speaks the reader's language. */}
                            <Text size="sm">{issue.file ? `${issue.file}: ` : ""}{t(issue.message, issue.values)}</Text>
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
                        value={config.limits.memoryBytes}
                        w={160}
                        onChange={kib => setLimit("memoryBytes", kib)}
                    />
                </Group>
                <Text size="xs" c="dimmed" mt="xs">
                    {t("Every test uses these unless its group says otherwise.")}
                </Text>
            </Card>

            <Card withBorder radius="sm">
                <Group justify="space-between" mb="xs">
                    <Title order={5}>{t("Tests")} ({tests.length})</Title>
                    {/* The two ways of adding a test, side by side: from files, or
                        typed in. They answer the same question. */}
                    <Group gap="xs">
                        <Button
                            variant="light"
                            size="compact-sm"
                            leftSection={<IconUpload size={14} />}
                            disabled={disabled}
                            loading={busy}
                            onClick={() => filesInput.current?.click()}
                        >
                            {t("Add test files")}
                        </Button>
                        <Button
                            variant="light"
                            size="compact-sm"
                            leftSection={<IconPlus size={14} />}
                            disabled={disabled}
                            onClick={() => {
                                // The group being worked on is the last one there
                                // is; the letter, the first one free in it.
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
                </Group>
                <Text size="xs" c="dimmed" mb="sm">
                    {t("Files are paired by name: 1a.in goes with 1a.out. The number is the group, the letter the test.")}
                </Text>
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
                                            value={group.limits?.memoryBytes}
                                            placeholder={config.limits.memoryBytes}
                                            onChange={kib => setGroupLimit(group.group, "memoryBytes", kib)}
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

            {/* Only with a model solution: there is nothing to measure without
                one, and a rule nobody can apply is a field nobody can answer. */}
            {modelSolution && (
                <Card withBorder radius="sm">
                    <Title order={5} mb={4}>{t("Limit calibration")}</Title>
                    <Text size="xs" c="dimmed" mb="sm">
                        {t("The model solution is measured once, on request, and the limits below are written into the package. Judging never runs it: a limit has to be a number every submission was held to, not one recomputed per run.")}
                    </Text>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th />
                                <Table.Th>{t("Multiplier")}</Table.Th>
                                <Table.Th>{t("Plus")}</Table.Th>
                                <Table.Th>{t("Rounded up to")}</Table.Th>
                                <Table.Th>{t("Example")}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {([
                                {
                                    field: "time" as const,
                                    label: t("Time limit"),
                                    units: TIME_UNITS,
                                    example: EXAMPLE_TIME_MS,
                                },
                                {
                                    field: "memory" as const,
                                    label: t("Memory limit"),
                                    units: MEMORY_UNITS,
                                    example: EXAMPLE_MEMORY_BYTES,
                                },
                            ]).map(row => {
                                const rule = calibrationRule(config.calibration, row.field);
                                // **The worked example, always.** What was
                                // measured is per group and lives in its own
                                // table below; one number here would have to
                                // pick a group and be wrong for every other.
                                const from = row.example;
                                return (
                                    <Table.Tr key={row.field}>
                                        <Table.Td><Text size="sm" fw={500}>{row.label}</Text></Table.Td>
                                        <Table.Td>
                                            <NumberInput
                                                min={0.1}
                                                step={0.5}
                                                w={100}
                                                disabled={disabled}
                                                value={rule.factor ?? 1}
                                                onChange={v => setCalibration(row.field, "factor", Number(v) || undefined)}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <UnitInput
                                                units={row.units}
                                                value={rule.add || undefined}
                                                placeholder={0}
                                                onChange={v => setCalibration(row.field, "add", v)}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <UnitInput
                                                units={row.units}
                                                value={rule.roundTo || undefined}
                                                placeholder={0}
                                                onChange={v => setCalibration(row.field, "roundTo", v)}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {t("at")}{" "}
                                                {inUnits(row.units, from)} → <b>{inUnits(row.units, applyCalibration(rule, from))}</b>
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                    <Group justify="space-between" mt="sm" wrap="wrap">
                        {/* Still disabled, and **for a different reason than it
                            used to be**. The measuring itself works end to end:
                            a trial is requested, a Runner claims it, measures
                            every model solution and reports per group.

                            What is missing is where to run it from. A trial is
                            asked for in an **activity**, because that is where
                            `trial:run` is granted — and this screen edits a
                            problem in the **library**, which belongs to no
                            activity. The old label said there was no Runner,
                            which stopped being true and would have sent
                            somebody looking in the wrong place. */}
                        <Button
                            variant="light"
                            size="compact-sm"
                            leftSection={<IconGauge size={14} />}
                            loading={measuring}
                            disabled={disabled || !onMeasure || measuring || config.modelSolution === undefined}
                            onClick={async () => {
                                if (!onMeasure) return;
                                setMeasuring(true);
                                try {
                                    const measured = await onMeasure(await build());
                                    // **Written into the package, not into the
                                    // limits.** Applying is the next click and
                                    // stays a decision: the measurement is a
                                    // fact, the limit is a choice.
                                    if (measured) {
                                        setTouched(true);
                                        setConfig(c => ({
                                            ...c,
                                            calibration: { ...c.calibration, measured },
                                        }));
                                    }
                                } catch (e) {
                                    // **Caught, or a trial fails in silence.**
                                    // `onMeasure` reports what went wrong by
                                    // throwing — the Runner's own words for a
                                    // refused package among them — and without
                                    // this every one of those was an unhandled
                                    // rejection that reached no screen.
                                    setError(e instanceof Error ? e.message : String(e));
                                } finally {
                                    setMeasuring(false);
                                }
                            }}
                        >
                            {t("Measure the model solution")}
                        </Button>
                        {measuredGroups(config.calibration).length > 0 && (
                            <Button
                                variant="light"
                                size="compact-sm"
                                disabled={disabled}
                                onClick={() => applySuggestions(measuredGroups(config.calibration))}
                            >
                                {t("Apply every suggestion")}
                            </Button>
                        )}
                    </Group>

                    {/* What was measured, and what it suggests — **per group**,
                        because that is where a limit lives: one number for a
                        whole problem calibrates a group that states three
                        seconds wrongly.

                        Shown rather than written in. The measurement is a fact
                        and the limit is a decision; a screen that applied the
                        numbers on arrival would take that decision away from
                        the person whose name is on the problem. */}
                    {measuredGroups(config.calibration).length > 0 && (
                        <>
                            <Text size="sm" fw={500} mt="md">{t("Measured, per group")}</Text>
                            <Text size="xs" c="dimmed" mb="xs">
                                {t("Suggested from the slowest language measured: a group's limit has to fit every language the activity accepts.")}
                            </Text>
                            <Table striped withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t("Group")}</Table.Th>
                                        <Table.Th>{t("Measured")}</Table.Th>
                                        <Table.Th>{t("Suggested limit")}</Table.Th>
                                        <Table.Th />
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {measuredGroups(config.calibration).map(group => {
                                        const rows = (config.calibration?.measured ?? [])
                                            .filter(m => m.group === group);
                                        const limits = suggestedForGroup(config.calibration, group);
                                        const held = config.groups.find(g => g.group === group)?.limits;
                                        const applied = held?.timeMs === limits.timeMs
                                            && held?.memoryBytes === limits.memoryBytes;
                                        return (
                                            <Table.Tr key={group}>
                                                <Table.Td><Text size="sm" fw={500}>{group}</Text></Table.Td>
                                                <Table.Td>
                                                    {rows.map((m, index) => (
                                                        <Text size="xs" c="dimmed" key={index}>
                                                            {m.language ? m.language + ": " : ""}
                                                            {inUnits(TIME_UNITS, m.timeMs)}
                                                            {m.memoryBytes === undefined
                                                                ? " · " + t("memory not measured")
                                                                : " · " + inUnits(MEMORY_UNITS, m.memoryBytes)}
                                                        </Text>
                                                    ))}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">
                                                        {limits.timeMs === undefined
                                                            ? "—"
                                                            : inUnits(TIME_UNITS, limits.timeMs)}
                                                        {limits.memoryBytes !== undefined
                                                            && " · " + inUnits(MEMORY_UNITS, limits.memoryBytes)}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Button
                                                        variant="subtle"
                                                        size="compact-xs"
                                                        disabled={disabled || applied}
                                                        onClick={() => applySuggestions([group])}
                                                    >
                                                        {applied ? t("Applied") : t("Apply")}
                                                    </Button>
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </>
                    )}
                </Card>
            )}

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
                    onClick={async () => {
                        const samples = await buildSamples();
                        if (samples) download(samples, "examples.zip");
                    }}
                >
                    {t("Download the samples")}
                </Button>
            </Group>
            <Text size="xs" c="dimmed" mt={-8}>
                {exampleTests.length > 0
                    ? t("The tests in the groups marked as examples are published for the participant as examples.zip.")
                    : t("No group is marked as examples, so the participant receives no example tests.")}
            </Text>

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
                                        <Tooltip label={t("Copy")}>
                                            <CopyButton value={file.content} variant="subtle" size="compact-sm">
                                                {() => <IconCopy size={14} />}
                                            </CopyButton>
                                        </Tooltip>
                                        {/* One button per file rather than one for the
                                            pair: a manager checking an output does not
                                            want the input in their downloads. */}
                                        <Tooltip label={`${t("Download")} ${file.name}`}>
                                            <DownloadButton
                                                variant="subtle"
                                                size="compact-sm"
                                                file={new Blob([file.content], { type: "text/plain" })}
                                                filename={file.name}
                                            >
                                                {() => <IconDownload size={14} />}
                                            </DownloadButton>
                                        </Tooltip>
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
