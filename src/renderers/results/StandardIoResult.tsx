import { Alert, Table, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./StandardIoResult.module.css";

/**
 * The per-test table for `standard-io` problems.
 *
 * Everything drawn here comes from the document the Runner attached, which the
 * Server stores without parsing. Nothing in this shape is Server schema, which
 * is what lets a new metric ship without a migration — and why this component
 * has to treat the document as untrusted input rather than as a typed model.
 */

interface StandardIoTest {
    no: number;
    status?: string;
    timeMs?: number;
    memoryBytes?: number;
    score?: number;
    maxScore?: number;
    note?: string;
    /**
     * Why it failed, as a value: `timeLimit`, `runtimeError`, and the rest of
     * the vocabulary `PACKAGE_FORMAT.md` states. Absent on a test that passed.
     *
     * Read as `string` and not as a union on purpose. The vocabulary belongs to
     * the problem type and grows without a Client release, so a value this
     * version has never heard of has to be an ordinary case rather than a
     * parse failure.
     */
    reason?: string;
}

interface StandardIoDocument {
    kind?: string;
    version?: number;
    limits?: { timeMs?: number; memoryBytes?: number };
    tests?: StandardIoTest[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const parse = (raw: unknown): StandardIoDocument | undefined => {
    if (!isRecord(raw)) return undefined;
    const tests = Array.isArray(raw.tests) ? raw.tests.filter(isRecord) as unknown as StandardIoTest[] : [];
    return {
        kind: typeof raw.kind === "string" ? raw.kind : undefined,
        version: typeof raw.version === "number" ? raw.version : undefined,
        limits: isRecord(raw.limits) ? raw.limits as StandardIoDocument["limits"] : undefined,
        tests,
    };
};

const statusClass = (status: string | undefined) => {
    // The document is whatever a Runner attached. A row without a status is a
    // row, not a crash: this component is the last thing between a malformed
    // result and a blank screen.
    switch ((status ?? "").toUpperCase()) {
        case "OK": return classes.ok;
        case "WARNING": return classes.warning;
        case "ERROR": return classes.error;
        default: return "";
    }
};

/**
 * A short label for a reason this version knows.
 *
 * **Returns nothing for anything else, and that is the whole point.** The
 * vocabulary belongs to the problem type and grows without a Client release, so
 * an unknown value falls back to the `note` — which is exactly what this table
 * showed before the field existed. A `default:` that printed the raw key would
 * put `runtimeError` in front of a participant.
 */
const reasonLabel = (reason: string | undefined, t: (key: string) => string): string | undefined => {
    switch (reason) {
        case "wrongAnswer": return t("Wrong answer");
        case "timeLimit": return t("Time limit");
        case "memoryLimit": return t("Memory limit");
        case "outputLimit": return t("Output limit");
        case "runtimeError": return t("Runtime error");
        case "policyViolation": return t("Rule violation");
        case "compilationError": return t("Compilation error");
        default: return undefined;
    }
};

/** Highlights a measurement that is close to, or over, its limit. */
const usageClass = (used: number | undefined, limit: number | undefined) => {
    if (used === undefined || limit === undefined || limit === 0) return "";
    if (used >= limit) return classes.error;
    if (used > limit / 2) return classes.warning;
    return "";
};

const seconds = (ms: number | undefined) => ms === undefined ? "—" : `${(ms / 1000).toFixed(2)} s`;

export default function StandardIoResult({ detail }: { detail: unknown }) {
    const { t } = useTranslation();
    const document = parse(detail);

    if (!document || document.tests === undefined) {
        return (
            <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                {t("No test results are available for this submission")}
            </Alert>
        );
    }
    if (document.tests.length === 0) {
        return (
            <Alert color="blue" icon={<IconInfoCircle size={18} />}>
                {t("Tests will appear here once the evaluation finishes")}
            </Alert>
        );
    }

    const timeLimit = document.limits?.timeMs;
    const memoryLimit = document.limits?.memoryBytes;

    /**
     * Bytes on the wire, mebibytes on the screen.
     *
     * The document states bytes because that is what the Runner measured and no
     * conversion should happen between the two — but `268435456` is not a limit
     * anybody reads, so the rounding happens here, at the last possible moment,
     * and never in stored data.
     */
    const mib = (bytes: number | undefined): string =>
        bytes === undefined ? "—" : Math.round(bytes / (1024 * 1024)).toString();

    return (
        <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>{t("Test")}</Table.Th>
                    <Table.Th>{t("Status")}</Table.Th>
                    <Table.Th>{t("Time")}</Table.Th>
                    <Table.Th>{t("Memory")}</Table.Th>
                    <Table.Th>{t("Result")}</Table.Th>
                    <Table.Th>{t("Comments")}</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {document.tests.map(test => (
                    <Table.Tr key={test.no}>
                        <Table.Td>{test.no}</Table.Td>
                        <Table.Td className={statusClass(test.status)}>{test.status ? t(test.status) : "—"}</Table.Td>
                        <Table.Td className={usageClass(test.timeMs, timeLimit)}>
                            {seconds(test.timeMs)}{timeLimit !== undefined ? ` / ${seconds(timeLimit)}` : ""}
                        </Table.Td>
                        <Table.Td className={usageClass(test.memoryBytes, memoryLimit)}>
                            {mib(test.memoryBytes)}{memoryLimit !== undefined ? ` / ${mib(memoryLimit)}` : ""} MiB
                        </Table.Td>
                        <Table.Td>
                            {test.score ?? "—"}{test.maxScore !== undefined ? ` / ${test.maxScore}` : ""}
                        </Table.Td>
                        <Table.Td>
                            {/* The reason first, because it is the thing a
                                participant acts on — and it is the same words
                                every time, so a table of failures can be read
                                down the column. The note stays underneath: it
                                carries the detail, and where it came from a
                                checker it is the only thing that does. */}
                            {reasonLabel(test.reason, t) !== undefined && (
                                <Text size="sm" fw={500}>{reasonLabel(test.reason, t)}</Text>
                            )}
                            {test.note && (
                                <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                                    {test.note}
                                </Text>
                            )}
                        </Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
}
