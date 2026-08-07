import { Alert, Stack, Table, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FindMeButton, FreezeBanner } from "./common";
import { RankingProps } from "./parse";
import { freezeOf, pointsBoard, PointsCell } from "./scoreboard";
import { useFindMe } from "./useFindMe";
import classes from "./PointsRanking.module.css";

/**
 * The points scoreboard: a column per series, expanding to its problems.
 *
 * Neither submission time nor execution time is considered — only points, whole
 * or partial according to how the activity is configured. The series that is
 * currently running starts expanded, because that is the one being watched.
 *
 * **The Server computes none of this**, as in the ICPC board beside it: it sends
 * the results a reader may see and `scoreboard.ts` works out the totals.
 */

/** A cell whose result is withheld says so rather than reading as a zero. */
const CellView = ({ cell }: { cell: PointsCell | undefined }) => {
    const { t } = useTranslation();
    if (cell === undefined) return <>—</>;
    if (cell.points === undefined) {
        return (
            <Tooltip label={t("Submitted during the freeze")}>
                <span>?</span>
            </Tooltip>
        );
    }
    return (
        <>
            {cell.points}
            {cell.pending && <Text component="span" c="dimmed"> ?</Text>}
        </>
    );
};

export default function PointsRanking({ results, timeZone, ranked }: RankingProps) {
    const { t } = useTranslation();
    const [myRow, findMe] = useFindMe();

    const rows = pointsBoard(results, ranked);
    const { frozen, revealAt } = freezeOf(results);

    // Whether anybody has a place. Under `participantOnly` the reader is sent
    // their own results and nobody else's, so there is no standing to be in —
    // and a blank column under a "#" reads as a bug rather than as a deliberate
    // omission.
    const placed = rows.some(row => row.rank !== undefined);
    const nameLeft = { left: placed ? "3.5rem" : 0 };

    // The round being worked on right now opens by default; a course watches the
    // current week, not the first one. The last is the fallback, because a course
    // whose rounds have all finished is looking at the most recent.
    const [expanded, setExpanded] = useState<string | undefined>(() =>
        results.series[results.series.length - 1]?.id);
    const toggle = (id: string) => setExpanded(current => current === id ? undefined : id);

    // A board with nobody on it is a normal state — an activity that has not
    // started, or one where nothing has been solved yet. It is not an error and
    // must not read as one.
    if (rows.length === 0) {
        return (
            <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                {t("No results yet")}
            </Alert>
        );
    }

    return (
        <Stack gap="sm">
            <FreezeBanner frozen={frozen} revealAt={revealAt} timeZone={timeZone} />
            <FindMeButton
                onClick={findMe}
                disabled={!results.me || !rows.some(r => r.contestantId === results.me)}
            />

            <Table.ScrollContainer minWidth={640}>
                <Table stickyHeader striped highlightOnHover withColumnBorders tabularNums>
                    <Table.Thead>
                        <Table.Tr>
                            {placed && <Table.Th className={classes.stickyPlace}>{t("Place")}</Table.Th>}
                            <Table.Th className={classes.stickyName} style={nameLeft}>
                                {t("Contestant")}
                            </Table.Th>
                            <Table.Th>{t("Solved")}</Table.Th>
                            <Table.Th>{t("Sum")}</Table.Th>
                            {results.series.map(s => {
                                const open = expanded === s.id;
                                return [
                                    <Table.Th key={s.id}>
                                        <UnstyledButton onClick={() => toggle(s.id)} className={classes.seriesHeader}>
                                            {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                            {/* Frozen rounds carry an asterisk, as
                                                the ICPC columns do: a total that
                                                is still moving must not read as a
                                                settled one. */}
                                            <span>{s.name}{s.frozen ? "*" : ""}</span>
                                        </UnstyledButton>
                                    </Table.Th>,
                                    ...(open ? s.problems.map(p => (
                                        <Table.Th key={`${s.id}-${p.slug}`} className={classes.problemHeader}>
                                            {p.slug}{s.frozen ? "*" : ""}
                                        </Table.Th>
                                    )) : []),
                                ];
                            })}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map(row => (
                            <Table.Tr
                                key={row.contestantId}
                                ref={row.contestantId === results.me ? myRow : undefined}
                                className={row.contestantId === results.me ? classes.me : undefined}
                            >
                                {placed && <Table.Td className={classes.stickyPlace}>{row.rank}</Table.Td>}
                                <Table.Td className={classes.stickyName} style={nameLeft}>{row.name}</Table.Td>
                                <Table.Td>{row.solved}</Table.Td>
                                <Table.Td><Text fw={600}>{row.total}</Text></Table.Td>
                                {results.series.map(s => {
                                    const cell = row.bySeries[s.id];
                                    const open = expanded === s.id;
                                    return [
                                        <Table.Td key={s.id}>{cell?.total ?? 0}</Table.Td>,
                                        ...(open ? s.problems.map(p => (
                                            <Table.Td key={`${s.id}-${p.slug}`} className={classes.problemCell}>
                                                <CellView cell={cell?.byProblem[p.slug]} />
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
