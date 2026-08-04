import { Alert, Badge, Button, Card, Code, Group, NumberInput, Stack, Switch, Table, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconDownload, IconFileZip, IconInfoCircle, IconUpload } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildPackage, buildSampleArchive, ExtraFile, readPackage } from "../../package/build";
import { groupsOf, intakeFiles } from "../../package/intake";
import { emptyConfig, PackageConfig, PackageGroup, TestFile } from "../../package/types";
import { hasErrors, validatePackage } from "../../package/validate";

/**
 * Assembles a Runner package from loose files.
 *
 * The archive is built in the browser rather than on the Server, because its
 * layout is a property of the problem type and the Server is not allowed to know
 * one type from another.
 */
export interface PackageBuilderProps {
    /** Publishes the built archive against the current version. */
    onUpload: (archive: Blob) => Promise<void>;
    disabled?: boolean;
}

const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
};

export default function PackageBuilder({ onUpload, disabled }: PackageBuilderProps) {
    const { t } = useTranslation();
    const filesInput = useRef<HTMLInputElement>(null);
    const packageInput = useRef<HTMLInputElement>(null);

    const [tests, setTests] = useState<TestFile[]>([]);
    const [checker, setChecker] = useState<ExtraFile | undefined>(undefined);
    const [modelSolution, setModelSolution] = useState<ExtraFile | undefined>(undefined);
    const [unrecognised, setUnrecognised] = useState<string[]>([]);
    const [config, setConfig] = useState<PackageConfig>(emptyConfig());
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    // Groups follow the tests: a group with no tests is points nobody can earn,
    // and a test outside every group is a test nobody is scored on.
    useEffect(() => {
        const present = groupsOf(tests);
        setConfig(current => {
            const kept = current.groups.filter(g => present.includes(g.group));
            const added = present
                .filter(g => !kept.some(k => k.group === g))
                .map((g): PackageGroup => ({ group: g, points: g === 0 ? 0 : 0, examples: g === 0 || undefined }));
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

    const take = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setError(undefined);
        setBusy(true);
        try {
            const intake = await intakeFiles([...files]);
            setTests(intake.tests);
            if (intake.checker) setChecker(intake.checker);
            if (intake.modelSolution) setModelSolution(intake.modelSolution);
            setUnrecognised(intake.unrecognised);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const openExisting = async (file: File | undefined) => {
        if (!file) return;
        setError(undefined);
        setBusy(true);
        try {
            // A built package can be downloaded, corrected by hand and brought
            // back: the builder assembles the format, it does not own it.
            const contents = await readPackage(file);
            setConfig(contents.config);
            setTests(contents.tests);
            setChecker(contents.checker);
            setModelSolution(contents.modelSolution);
            setUnrecognised([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const withArchive = async (f: (archive: Blob) => Promise<void> | void) => {
        setError(undefined);
        setBusy(true);
        try {
            await f(await buildPackage({ config: configWithPrograms, tests, checker, modelSolution }));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const setGroup = (group: number, patch: Partial<PackageGroup>) =>
        setConfig(c => ({ ...c, groups: c.groups.map(g => g.group === group ? { ...g, ...patch } : g) }));

    const exampleTests = tests.filter(t => configWithPrograms.groups.find(g => g.group === t.group)?.examples);

    return (
        <Stack gap="md">
            <Group gap="xs" wrap="wrap">
                <Button variant="light" leftSection={<IconUpload size={16} />} onClick={() => filesInput.current?.click()} loading={busy}>
                    {t("Add test files")}
                </Button>
                <Button variant="light" leftSection={<IconFileZip size={16} />} onClick={() => packageInput.current?.click()} loading={busy}>
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
                <Title order={5} mb="sm">{t("Limits")}</Title>
                <Group grow>
                    <NumberInput
                        label={t("Time limit (ms)")}
                        min={1}
                        value={config.limits.timeMs}
                        onChange={v => setConfig(c => ({ ...c, limits: { ...c.limits, timeMs: Number(v) || 0 } }))}
                    />
                    <NumberInput
                        label={t("Memory limit (MB)")}
                        min={1}
                        value={config.limits.memoryMb}
                        onChange={v => setConfig(c => ({ ...c, limits: { ...c.limits, memoryMb: Number(v) || 0 } }))}
                    />
                </Group>
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
                                <Table.Th>{t("Examples")}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {configWithPrograms.groups.map(group => (
                                <Table.Tr key={group.group}>
                                    <Table.Td><Text fw={500}>{group.group}</Text></Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {tests.filter(t => t.group === group.group).map(t => t.name).join(", ")}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <NumberInput
                                            min={0}
                                            w={110}
                                            value={group.points}
                                            onChange={v => setGroup(group.group, { points: Number(v) || 0 })}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        {/* Marked rather than inferred: "shown in the
                                            statement" and "worth nothing" are two
                                            different properties that group 0 happens
                                            to combine. */}
                                        <Switch
                                            checked={!!group.examples}
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
                    <Group justify="space-between">
                        <Text size="sm">{t("Checker")}</Text>
                        {checker
                            ? <Group gap="xs"><Code>{checker.name}</Code><Badge size="sm" variant="light">{languageOf(checker.name)}</Badge></Group>
                            : <Text size="sm" c="dimmed">{t("None — the .out files decide")}</Text>}
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm">{t("Model solution")}</Text>
                        {modelSolution
                            ? <Group gap="xs"><Code>{modelSolution.name}</Code><Badge size="sm" variant="light">{languageOf(modelSolution.name)}</Badge></Group>
                            : <Text size="sm" c="dimmed">{t("None — limits cannot be calibrated")}</Text>}
                    </Group>
                </Stack>
            </Card>

            {unrecognised.length > 0 && (
                <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title={t("Ignored files")}>
                    <Text size="sm">{unrecognised.join(", ")}</Text>
                </Alert>
            )}

            <Group justify="space-between" wrap="wrap">
                <Group gap="xs">
                    <Button
                        variant="light"
                        leftSection={<IconDownload size={16} />}
                        disabled={tests.length === 0}
                        loading={busy}
                        onClick={() => withArchive(archive => download(archive, "package.zip"))}
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
                <Button
                    disabled={blocked || tests.length === 0 || disabled}
                    loading={busy}
                    onClick={() => withArchive(onUpload)}
                >
                    {t("Attach to this version")}
                </Button>
            </Group>
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
