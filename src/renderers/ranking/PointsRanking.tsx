import { Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FindMeButton, FreezeBanner } from "./common";
import { asArray, asNumber, asString, isRecord, RankingProps } from "./parse";
import { useFindMe } from "./useFindMe";
import classes from "./PointsRanking.module.css";

/**
 * The points scoreboard: a column per series, expanding to its problems.
 *
 * Neither submission time nor execution time is considered — only points, whole
 * or partial according to how the activity is configured. The series that is
 * currently running starts expanded, because that is the one being watched.
 */

interface ProblemColumn {
    slug: string;
    name: string;
    maxScore: number | undefined;
}

interface SeriesColumn {
    id: string;
    name: string;
    problems: ProblemColumn[];
}

interface Row {
    rank?: number;
    id?: string;
    name?: string;
    solved?: number;
    total?: number;
    bySeries: Record<string, { total?: number; byProblem: Record<string, number> }>;
}

const parseSeries = (raw: unknown): SeriesColumn | undefined => {
    if (!isRecord(raw)) return undefined;
    const id = asString(raw.id);
    if (!id) return undefined;
    return {
        id,
        name: asString(raw.name) ?? id,
        problems: asArray(raw.problems)
            .map((p): ProblemColumn | undefined => isRecord(p)
                ? { slug: asString(p.slug) ?? "", name: asString(p.name) ?? "", maxScore: asNumber(p.maxScore) }
                : undefined)
            .filter((p): p is ProblemColumn => !!p && p.slug !== ""),
    };
};

const parseRow = (raw: unknown): Row | undefined => {
    if (!isRecord(raw)) return undefined;
    const bySeries: Row["bySeries"] = {};
    if (isRecord(raw.bySeries)) {
        for (const [seriesId, value] of Object.entries(raw.bySeries)) {
            const byProblem: Record<string, number> = {};
            if (isRecord(value) && isRecord(value.byProblem)) {
                for (const [slug, score] of Object.entries(value.byProblem)) {
                    const n = asNumber(score);
                    if (n !== undefined) byProblem[slug] = n;
                }
            }
            bySeries[seriesId] = {
                total: isRecord(value) ? asNumber(value.total) : undefined,
                byProblem,
            };
        }
    }
    return {
        rank: asNumber(raw.rank),
        id: asString(raw.id),
        name: asString(raw.name),
        solved: asNumber(raw.solved),
        total: asNumber(raw.total),
        bySeries,
    };
};

export default function PointsRanking({ ranking, timeZone }: RankingProps) {
    const { t } = useTranslation();
    const [myRow, findMe] = useFindMe();

    const document = isRecord(ranking) ? ranking : {};
    const series = asArray(document.series).map(parseSeries).filter((s): s is SeriesColumn => !!s);
    const rows = asArray(document.rows).map(parseRow).filter((r): r is Row => !!r);
    const me = asString(document.me);

    // The series being worked on right now opens by default; the rest stay
    // collapsed so the table is readable at a glance.
    const [expanded, setExpanded] = useState<string | undefined>(() => asString(document.activeSeriesId));

    const toggle = (id: string) => setExpanded(current => current === id ? undefined : id);

    return (
        <Stack gap="sm">
            <FreezeBanner
                frozen={document.frozen === true}
                revealAt={asString(document.revealAt)}
                timeZone={timeZone}
            />
            <FindMeButton onClick={findMe} disabled={!me || !rows.some(r => r.id === me)} />

            <Table.ScrollContainer minWidth={640}>
                <Table stickyHeader striped highlightOnHover withColumnBorders tabularNums>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("Place")}</Table.Th>
                            <Table.Th>{t("Contestant")}</Table.Th>
                            <Table.Th>{t("Solved")}</Table.Th>
                            <Table.Th>{t("Sum")}</Table.Th>
                            {series.map(s => {
                                const open = expanded === s.id;
                                return [
                                    <Table.Th key={s.id}>
                                        <UnstyledButton onClick={() => toggle(s.id)} className={classes.seriesHeader}>
                                            {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                            <span>{s.name}</span>
                                        </UnstyledButton>
                                    </Table.Th>,
                                    ...(open ? s.problems.map(p => (
                                        <Table.Th key={`${s.id}-${p.slug}`} className={classes.problemHeader}>
                                            {p.slug}
                                        </Table.Th>
                                    )) : []),
                                ];
                            })}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map(row => (
                            <Table.Tr
                                key={row.id ?? row.rank}
                                ref={row.id === me ? myRow : undefined}
                                className={row.id === me ? classes.me : undefined}
                            >
                                <Table.Td>{row.rank}</Table.Td>
                                <Table.Td>{row.name}</Table.Td>
                                <Table.Td>{row.solved}</Table.Td>
                                <Table.Td><Text fw={600}>{row.total}</Text></Table.Td>
                                {series.map(s => {
                                    const cell = row.bySeries[s.id];
                                    const open = expanded === s.id;
                                    return [
                                        <Table.Td key={s.id}>{cell?.total ?? 0}</Table.Td>,
                                        ...(open ? s.problems.map(p => (
                                            <Table.Td key={`${s.id}-${p.slug}`} className={classes.problemCell}>
                                                {cell?.byProblem[p.slug] ?? "—"}
                                            </Table.Td>
                                        )) : []),
                                    ];
                                })}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Stack>
    );
}
