import {
    Alert, Badge, Button, FileInput, Group, Modal, Stack, Table, Text, TextInput,
} from "@mantine/core";
import { IconAlertTriangle, IconUpload } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BundleContents, readBundle } from "../../exchange/bundle";
import { applyBundle, ImportOutcome } from "../../exchange/apply";
import { ImportPlan, LibraryProblem, planImport, Resolution, summarise } from "../../exchange/plan";
import { useApiCall } from "../../provider/apiContext";

/**
 * Bringing a bundle into this installation, in two steps.
 *
 * **The first step writes nothing**, and that is the design. An import creates
 * problems in a shared library and rounds in a live activity; a manager sees
 * which are new, which are already here, and which the bundle and the library
 * disagree about — and answers the third before a single call is made.
 *
 * **A slug that matches with different bytes is a question, never a silent
 * substitution.** Attaching somebody else's `zadanie-1` to an imported round
 * would set the wrong work to a whole cohort, and nothing on any screen would
 * say so afterwards.
 */

interface ImportBundleModalProps {
    opened: boolean;
    onClose: () => void;
    onImported: (outcome: ImportOutcome) => void;
}

export default function ImportBundleModal({ opened, onClose, onImported }: ImportBundleModalProps) {
    const { t } = useTranslation();
    const call = useApiCall();

    const [contents, setContents] = useState<BundleContents | undefined>(undefined);
    const [plan, setPlan] = useState<ImportPlan | undefined>(undefined);
    const [slug, setSlug] = useState("");
    const [startsAt, setStartsAt] = useState("");
    const [error, setError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    const reset = () => {
        setContents(undefined);
        setPlan(undefined);
        setSlug("");
        setStartsAt("");
        setError(undefined);
    };

    const read = async (file: File | null) => {
        reset();
        if (!file) return;

        setBusy(true);
        try {
            const read = await readBundle(file);

            // **The library is read to plan against, never to decide from.** The
            // Server settles what is taken when the write happens; this is what
            // lets the manager see the answer first.
            const library = await call(api => api.managerApi.getProblems({
                page: 1, pageSize: 500,
                // **Archived ones too.** They are out of the picker and still
                // hold their slugs, so a plan blind to them proposes creating
                // something the database refuses.
                includeArchived: true,
            }));
            const versions: LibraryProblem[] = [];
            for (const problem of library.items) {
                const all = await call(api => api.managerApi.getProblemVersions(problem.id));
                const newest = [...all].sort((a, b) => b.version - a.version)[0];
                versions.push({
                    id: problem.id,
                    slug: problem.slug,
                    name: problem.name,
                    archived: problem.archivedAt !== undefined,
                    sha256: newest?.files.map(f => f.sha256) ?? [],
                });
            }

            setContents(read);
            setPlan(planImport(read.bundle, versions));
            setSlug(read.bundle.activity?.slug ?? "");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const decide = (problemSlug: string, action: Resolution) =>
        setPlan(current => current && {
            ...current,
            problems: current.problems.map(p => p.slug === problemSlug ? { ...p, action } : p),
        });

    const activity = contents?.bundle.activity;
    const counts = plan ? summarise(plan) : undefined;
    const ready = Boolean(contents && plan)
        && (!activity || (slug.trim().length > 0 && startsAt.length > 0));

    const go = async () => {
        if (!contents || !plan) return;
        setBusy(true);
        setError(undefined);
        try {
            const outcome = await call(api => applyBundle(api, contents, {
                activitySlug: slug.trim(),
                startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
                plan,
            }));
            reset();
            onImported(outcome);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal opened={opened} onClose={() => { reset(); onClose(); }} title={t("Import from a file")} size="lg">
            <Stack gap="sm">
                <Text size="sm">
                    {t("An archive exported from AlgoJudge: a problem, a round or a whole activity with everything it sets.")}
                </Text>

                <FileInput
                    label={t("The archive")}
                    placeholder="algojudge-....zip"
                    accept=".zip"
                    leftSection={<IconUpload size={16} />}
                    onChange={read}
                    disabled={busy}
                />

                {error && <Alert color="red">{error}</Alert>}

                {plan && counts && (
                    <>
                        <Text size="sm" fw={500}>
                            {t("{{create}} to create, {{reuse}} already here, {{beside}} beside what is here.", counts)}
                        </Text>

                        {counts.asking > 0 && (
                            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
                                {t("Some of these share a slug with a problem already in the library, and hold different files. Choose what happens to each: nothing is guessed.")}
                            </Alert>
                        )}

                        <Table.ScrollContainer minWidth={500}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t("Problem")}</Table.Th>
                                        <Table.Th>{t("What happens")}</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {plan.problems.map(problem => (
                                        <Table.Tr key={problem.slug}>
                                            <Table.Td>
                                                <Text size="sm">{problem.name}</Text>
                                                <Text size="xs" c="dimmed" ff="monospace">{problem.slug}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                {!problem.asks && (
                                                    <Badge variant="light" color={problem.action === "reuse" ? "gray" : "teal"}>
                                                        {problem.action === "reuse" ? t("already here") : t("created")}
                                                    </Badge>
                                                )}
                                                {problem.asks && (
                                                    <Group gap="xs">
                                                        <Button
                                                            size="compact-xs"
                                                            variant={problem.action === "beside" ? "filled" : "default"}
                                                            onClick={() => decide(problem.slug, "beside")}
                                                        >
                                                            {t("import as {{slug}}", { slug: problem.besideSlug })}
                                                        </Button>
                                                        <Button
                                                            size="compact-xs"
                                                            variant={problem.action === "reuse" ? "filled" : "default"}
                                                            onClick={() => decide(problem.slug, "reuse")}
                                                        >
                                                            {t("use the one already here")}
                                                        </Button>
                                                    </Group>
                                                )}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>

                        {plan.dangling.length > 0 && (
                            <Alert color="orange">
                                {t("The archive assigns problems it does not carry: {{slugs}}. Those assignments are skipped.",
                                    { slugs: plan.dangling.join(", ") })}
                            </Alert>
                        )}

                        {activity && (
                            <>
                                <TextInput
                                    label={t("A name of its own")}
                                    description={t("The slug the activity takes here. The one it had may be free, and may not.")}
                                    value={slug}
                                    onChange={event => setSlug(event.currentTarget.value)}
                                />
                                {/* The one field an import cannot infer. Without it
                                    the rounds land on the dates they had, which is
                                    the failure this whole step exists to prevent. */}
                                <TextInput
                                    type="datetime-local"
                                    label={t("When the first round starts")}
                                    description={t("Every other date moves with it, keeping the hour it had in {{zone}}.", { zone: activity.timeZone })}
                                    value={startsAt}
                                    onChange={event => setStartsAt(event.currentTarget.value)}
                                />
                            </>
                        )}
                    </>
                )}

                <Group justify="flex-end">
                    <Button variant="default" onClick={() => { reset(); onClose(); }}>{t("Back")}</Button>
                    <Button disabled={!ready || busy} loading={busy} onClick={go}>
                        {t("Import it")}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
