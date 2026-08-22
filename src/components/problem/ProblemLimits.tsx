import { Alert, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
    GroupLimits, LanguageLimits, limitsByGroup, limitsByLanguage, showMemory, showTime,
} from "./limits";

/**
 * The limits a problem is judged under, on the two axes a package states them.
 *
 * Renders nothing where the assignment states none — which is not "no limits",
 * it is "this assignment did not override the package", and a package's own
 * numbers are not published to a participant. A screen that printed "—" in that
 * case would be answering a question nobody can answer here.
 *
 * See `limits.ts` for why this is two tables rather than one.
 */
export interface ProblemLimitsProps {
    config: unknown,
}

export default function ProblemLimits({ config }: ProblemLimitsProps) {
    const { t } = useTranslation();

    const groups: GroupLimits[] = limitsByGroup(config);
    const languages: LanguageLimits[] = limitsByLanguage(config);
    if (groups.length === 0 && languages.length === 0) return null;

    // The rows a language override does not reach. Said once, above the table
    // that carries them, rather than as a footnote nobody reads.
    const fixed = groups.filter(g => g.own);

    return (
        <Stack gap="sm">
            <Title order={4}>{t("Limits")}</Title>

            {groups.length > 0 && (
                <Stack gap={4}>
                    <Text size="sm" fw={500}>{t("Per test group")}</Text>
                    <Table striped withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t("Group")}</Table.Th>
                                <Table.Th>{t("Points")}</Table.Th>
                                <Table.Th>{t("Time")}</Table.Th>
                                <Table.Th>{t("Memory")}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {groups.map(g => (
                                <Table.Tr key={g.group}>
                                    <Table.Td>
                                        <Group gap={6}>
                                            {/*
                                              * **Wrapped, and it has to be.** Mantine's
                                              * `Group` filters out falsy children so a gap
                                              * does not appear where one was skipped — and
                                              * `0` is falsy, so a bare `{g.group}` drew
                                              * nothing at all for group 0. Which is the one
                                              * group every problem has.
                                              */}
                                            <Text span>{g.group}</Text>
                                            {/* Group 0 is the statement's examples and is
                                                worth nothing, which is worth saying beside
                                                a zero in the points column. */}
                                            {g.examples && (
                                                <Text size="xs" c="dimmed">{t("examples")}</Text>
                                            )}
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>{g.points ?? "—"}</Table.Td>
                                    <Table.Td>
                                        {showTime(g.limits.timeMs)}
                                        {g.own && <Text span size="xs" c="dimmed"> *</Text>}
                                    </Table.Td>
                                    <Table.Td>{showMemory(g.limits.memoryBytes)}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Stack>
            )}

            {languages.length > 0 && (
                <Stack gap={4}>
                    <Text size="sm" fw={500}>{t("Per language")}</Text>
                    <Table striped withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t("Language")}</Table.Th>
                                <Table.Th>{t("Time")}</Table.Th>
                                <Table.Th>{t("Memory")}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {languages.map(l => (
                                <Table.Tr key={l.key}>
                                    <Table.Td>{l.label}</Table.Td>
                                    <Table.Td>{showTime(l.limits.timeMs)}</Table.Td>
                                    <Table.Td>{showMemory(l.limits.memoryBytes)}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Stack>
            )}

            {/*
              * **The one thing two tables cannot show, said in words.** The two
              * axes never meet: a group that states its own limits is judged
              * under them whatever language the solution is in, and the language
              * table reaches only the groups that state none.
              *
              * Printed only where there is something to get wrong — both tables
              * present, and at least one group carrying its own.
              */}
            {languages.length > 0 && fixed.length > 0 && (
                <Alert color="blue" icon={<IconInfoCircle size={18} />}>
                    {t("A group marked * is judged under its own time limit whatever language you write in; the per-language table reaches the other groups.")}
                </Alert>
            )}
        </Stack>
    );
}
