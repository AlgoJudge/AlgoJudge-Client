import { Alert, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { FindMeButton, FreezeBanner } from "./common";
import { asArray, asNumber, asString, isRecord, RankingProps } from "./parse";
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
 * The Server computes none of this. It arrives in the document the Runner
 * attached, reduced to what the ranking needs.
 */

interface Cell {
    attempts?: number;
    /** Minutes from the start of the series, at the first accepted submission. */
    acceptedAt?: number;
    /** Submitted during the freeze: counted later, shown as unresolved now. */
    pending?: boolean;
}

interface Row {
    rank?: number;
    id?: string;
    name?: string;
    solved?: number;
    penalty?: number;
    cells: Record<string, Cell>;
}

const parseCell = (raw: unknown): Cell => {
    if (!isRecord(raw)) return {};
    return {
        attempts: asNumber(raw.attempts),
        acceptedAt: asNumber(raw.acceptedAt),
        pending: raw.pending === true,
    };
};

const parseRow = (raw: unknown): Row | undefined => {
    if (!isRecord(raw)) return undefined;
    const cells: Record<string, Cell> = {};
    if (isRecord(raw.cells)) {
        for (const [slug, cell] of Object.entries(raw.cells)) cells[slug] = parseCell(cell);
    }
    return {
        rank: asNumber(raw.rank),
        id: asString(raw.id),
        name: asString(raw.name),
        solved: asNumber(raw.solved),
        penalty: asNumber(raw.penalty),
        cells,
    };
};

const CellView = ({ cell }: { cell: Cell }) => {
    const { t } = useTranslation();
    const attempts = cell.attempts ?? 0;

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
                <Text size="sm" fw={600}>{cell.acceptedAt}</Text>
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

export default function IcpcRanking({ ranking, timeZone }: RankingProps) {
    const { t } = useTranslation();
    const [myRow, findMe] = useFindMe();

    if (!isRecord(ranking)) return null;

    const problems = asArray(ranking.problems)
        .map(p => isRecord(p) ? { slug: asString(p.slug) ?? "", name: asString(p.name) ?? "" } : undefined)
        .filter((p): p is { slug: string; name: string } => !!p);
    const rows = asArray(ranking.rows).map(parseRow).filter((r): r is Row => !!r);
    const me = asString(ranking.me);

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
            <FreezeBanner
                frozen={ranking.frozen === true}
                revealAt={asString(ranking.revealAt)}
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
                            <Table.Th>{t("Penalty")}</Table.Th>
                            {problems.map(p => (
                                <Table.Th key={p.slug}>
                                    <Tooltip label={p.name}><span>{p.slug}</span></Tooltip>
                                </Table.Th>
                            ))}
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
                                <Table.Td>{row.penalty}</Table.Td>
                                {problems.map(p => (
                                    <Table.Td key={p.slug} className={classes.cell}>
                                        <CellView cell={row.cells[p.slug] ?? {}} />
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
