import { Alert, Badge, Group, Stack, Table, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

/**
 * What came back from an archive this installation does not run.
 *
 * **The verdict is somebody else's opinion, and the screen says so.** A
 * `uva@1` problem is judged on `onlinejudge.org`; AlgoJudge holds the
 * submission and the answer, and nothing here is arithmetic we did. There is no
 * per-test table because the archive discloses none — no test count, no
 * percentage, no groups — so a table would be a shape invented to look familiar.
 *
 * Everything drawn comes from the document the Runner attached, which the Server
 * stores without parsing. It is treated as untrusted input rather than a typed
 * model, for the same reason `StandardIoResult` does.
 */

interface External {
    judge?: string;
    problemNumber?: number;
    submissionId?: number;
    verdict?: string;
    verdictAbbr?: string;
    runtimeMs?: number;
    submittedAtUnix?: number;
    judgedAtUnix?: number;
}

interface UvaDocument {
    external?: External;
    compilation?: { status?: string };
    failure?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const parse = (detail: unknown): UvaDocument | undefined => {
    if (!isRecord(detail)) return undefined;
    const external = isRecord(detail.external) ? (detail.external as External) : undefined;
    const compilation = isRecord(detail.compilation)
        ? (detail.compilation as { status?: string })
        : undefined;
    return {
        external,
        compilation,
        failure: typeof detail.failure === "string" ? detail.failure : undefined,
    };
};

/**
 * Seconds since the epoch, not an ISO string.
 *
 * The Runner sends `…Unix` names deliberately: producing ISO would have meant a
 * date library for two fields, and a number that cannot be misread beats a
 * string that only looks familiar.
 */
const moment = (unix: number | undefined, locale: string) =>
    unix === undefined ? "—" : new Date(unix * 1000).toLocaleString(locale);

const milliseconds = (ms: number | undefined) => (ms === undefined ? "—" : `${ms} ms`);

export default function UvaResult({ detail }: { detail: unknown }) {
    const { t, i18n } = useTranslation();
    const document = parse(detail);
    const external = document?.external;

    if (!external) {
        return (
            <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                {t("No answer from the external judge is available for this submission")}
            </Alert>
        );
    }

    // A submission the archive never judged. Said plainly, because "no result"
    // and "a wrong answer" are different things and only one of them is about
    // the person who wrote the solution.
    if (document.failure) {
        return (
            <Stack gap="sm">
                <Alert color="orange" icon={<IconInfoCircle size={18} />}>
                    {t("This submission was never judged by the external judge")}
                </Alert>
                <Text size="sm" c="dimmed">{document.failure}</Text>
                <Text size="sm">
                    {t("Submission {{id}} on {{judge}}", {
                        id: external.submissionId ?? "—",
                        judge: external.judge ?? "onlinejudge.org",
                    })}
                </Text>
            </Stack>
        );
    }

    return (
        <Stack gap="sm">
            <Group gap="xs">
                {external.verdictAbbr && (
                    <Badge size="lg" variant="light" styles={{ label: { overflow: "visible" } }}>
                        {external.verdictAbbr}
                    </Badge>
                )}
                <Text fw={500}>{external.verdict ?? "—"}</Text>
            </Group>

            <Text size="sm" c="dimmed">
                {t("Judged by {{judge}}, which is not this installation. The verdict is theirs.", {
                    judge: external.judge ?? "onlinejudge.org",
                })}
            </Text>

            <Table withTableBorder withColumnBorders>
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>{t("Run time")}</Table.Th>
                        <Table.Td>{milliseconds(external.runtimeMs)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>{t("Problem in the archive")}</Table.Th>
                        <Table.Td>{external.problemNumber ?? "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        {/* Shown as text, never as a link: this is a participant
                            screen, and a participant screen reaches no other host. */}
                        <Table.Th>{t("Submission in the archive")}</Table.Th>
                        <Table.Td>{external.submissionId ?? "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>{t("Sent")}</Table.Th>
                        <Table.Td>{moment(external.submittedAtUnix, i18n.language)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>{t("Judged")}</Table.Th>
                        <Table.Td>{moment(external.judgedAtUnix, i18n.language)}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            {document.compilation?.status === "ERROR" && (
                <Alert color="red" icon={<IconInfoCircle size={18} />}>
                    {/* The archive sends compiler output by email and excludes
                        warnings, so there is nothing to show — measured, not assumed. */}
                    {t("The archive reports a compilation error. It does not disclose the compiler's output.")}
                </Alert>
            )}
        </Stack>
    );
}
