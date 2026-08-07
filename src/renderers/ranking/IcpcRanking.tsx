import { Alert, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { FindMeButton, FreezeBanner } from "./common";
import { RankingProps } from "./parse";
import { minutesAsClock } from "../../components/time/format";
import { columnsOf, freezeOf, icpcBoard, IcpcCell } from "./scoreboard";
import { useFindMe } from "./useFindMe";
import classes from "./IcpcRanking.module.css";

/**
 * The ICPC scoreboard.
 *
 * One column per problem, not per series — which is why this is a separate
 * renderer rather than a sort order on the points table. Rank is by problems
 * solved, then by penalty time: the minute of the first accepted submission plus
 * twenty minutes for each rejected attempt before it. Unsolved problems
 * contribute nothing.
 *
 * **The Server computes none of this.** It sends the results a reader may see
 * and this works out what they add up to — see `scoreboard.ts`. A Server
 * computing a penalty would be encoding one ranking type's semantics.
 */

const CellView = ({ cell }: { cell: IcpcCell }) => {
    const { t } = useTranslation();
    const { attempts } = cell;

    if (cell.pending) {
        return (
            <Tooltip label={t("Submitted during the freeze")}>
                <div className={classes.pending}>
                    <Text size="sm" fw={600}>?</Text>
                    <Text size="xs">{attempts}</Text>
                </div>
            </Tooltip>
        );
    }
    if (cell.acceptedAt !== undefined) {
        return (
            <div className={classes.solved}>
                <Text size="sm" fw={600}>{minutesAsClock(cell.acceptedAt)}</Text>
                {/* An accepted problem still shows its cost: the attempts before it. */}
                <Text size="xs">{attempts > 1 ? `+${attempts - 1}` : ""}</Text>
            </div>
        );
    }
    if (attempts > 0) {
        return (
            <div className={classes.failed}>
                <Text size="sm" fw={600}>—</Text>
                <Text size="xs">{attempts}</Text>
            </div>
        );
    }
    return <div className={classes.untouched} />;
};

export default function IcpcRanking({ results, timeZone, ranked }: RankingProps) {
    const { t } = useTranslation();
    const [myRow, findMe] = useFindMe();

    const columns = columnsOf(results);
    const rows = icpcBoard(results, ranked);
    const { frozen, revealAt } = freezeOf(results);

    // Whether anybody has a place. Under `participantOnly` the Server sends the
    // reader's results and nobody else's, so there is no standing to be in — and
    // a blank column under a "#" reads as a bug rather than as a deliberate
    // omission.
    const placed = rows.some(row => row.rank !== undefined);
    // The name column starts where the place column ends, and at zero when there
    // is no place column to sit beside.
    const nameLeft = { left: placed ? "3.5rem" : 0 };

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
                            <Table.Th>{t("Penalty")}</Table.Th>
                            {columns.map(column => (
                                <Table.Th key={column.slug}>
                                    {/* A frozen round's columns carry an asterisk.
                                        The combined board mixes rounds, and one
                                        that put withheld columns beside settled
                                        ones without saying so would read as a
                                        standing when it is not one. */}
                                    <Tooltip label={column.frozen
                                        ? `${column.name} — ${t("this round's ranking is frozen")}`
                                        : column.name}>
                                        <span>{column.slug}{column.frozen ? "*" : ""}</span>
                                    </Tooltip>
                                </Table.Th>
                            ))}
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
                                <Table.Td>{minutesAsClock(row.penalty)}</Table.Td>
                                {columns.map(column => (
                                    <Table.Td key={column.slug} className={classes.cell}>
                                        <CellView cell={row.cells[column.slug] ?? { attempts: 0 }} />
                                    </Table.Td>
                                ))}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Stack>
    );
}
