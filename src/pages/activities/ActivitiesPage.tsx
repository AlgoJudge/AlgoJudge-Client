import { Badge, Card, Chip, Group, Pagination, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconLock, IconQuestionMark, IconSchool, IconTrophy } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { activityEntryPath } from "../../api/activityDocuments";
import { Activity, ActivityState } from "../../api/ParticipantApi";
import { useApiEffect } from "../../provider/apiContext";
import LoadState from "../../components/LoadState";
import { typeName } from "../../renderers";
import classes from "./ActivitiesPage.module.css";
import { displayProps } from "../../components/submission/offered";

const PAGE_SIZE = 5;

/**
 * The mark beside an activity's name.
 *
 * **A tile, and the tile is the size.** Tabler's glyphs do not fill their
 * 24×24 box equally — measured at a 48px box, the trophy draws 36×34 and the
 * mortarboard 40×28 — so at one `size` they still read as two. The drawing is
 * no longer what the eye measures: the tile around it is the same square
 * whatever is inside, and the glyph only has to fit.
 */
const getIcon = (type: string) => {
    // The icon follows the type's name, so a new version of a known type keeps
    // its icon instead of falling through to the default.
    const Icon = ((): typeof IconTrophy => {
        switch (typeName(type)) {
            case "contest":
                return IconTrophy;
            case "course":
                return IconSchool;
            default:
                return IconQuestionMark;
        }
    })();

    return (
        <ThemeIcon variant="light" size={48} radius="md" className={classes.icon}>
            <Icon size={28} />
        </ThemeIcon>
    );
};

const STATES: ActivityState[] = ["ongoing", "upcoming", "finished"];
const TYPES = ["contest", "course"];

export default function ActivitiesPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [states, setStates] = useState<ActivityState[]>([]);
    const [types, setTypes] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<Activity[] | undefined>(undefined);
    const [total, setTotal] = useState(0);
    const [reload, setReload] = useState(0);

    // Paging and filtering are the Server's job. Fetching everything and slicing
    // in the Client only works while the list is short, and stops silently when
    // it is not.
    const error = useApiEffect(async (api) => {
        // **The list stays on screen while the next one loads.** Resetting it
        // here ran on every effect run, not only the first, so the `!items`
        // guard below fired on every refetch and took the screen down to a
        // spinner — filter row, open dialog and all.
        //
        // Deleting the reset is the whole fix: `items` is undefined only before
        // the first load has ever finished, which is what that guard was written
        // for. **The rule belongs to the idiom, not to this screen**: it was
        // fixed on `ParticipantsPanel` in August and across the eight manager
        // lists on 2026-09-14, and these four inherited neither because both
        // were recorded against the screens that found them.
        const result = await api.participantApi.getActivities({ page, pageSize: PAGE_SIZE, states, types });
        setItems(result.items);
        setTotal(result.total);

        // An activity appearing, vanishing or changing state moves it between
        // pages, so the page is refetched rather than patched — splicing a new
        // row into the visible page would put it wherever it happened to arrive
        // instead of where the filters and the ordering put it.
        const refetch = () => setReload(n => n + 1);
        api.participantApi.eventDispatcher.addEventListener("activityCreated", refetch);
        api.participantApi.eventDispatcher.addEventListener("activityDeleted", refetch);
        api.participantApi.eventDispatcher.addEventListener("activityUpdated", evt =>
            setItems(current => current?.map(a => a.id === evt.data.activity.id ? evt.data.activity : a)));
    }, [page, states, types, reload]);

    const onFilterChange = <T,>(set: (value: T[]) => void) => (value: T[]) => {
        set(value);
        // A filter that leaves the reader on page 4 of a one-page result looks
        // like an empty list.
        setPage(1);
    };

    const membershipBadge = (activity: Activity) => {
        switch (activity.membership) {
            case "invited":
                return <Badge color="blue" variant="light">{t("Invited")}</Badge>;
            case "open":
                return <Badge color="teal" variant="light">{t("Open to join")}</Badge>;
            default:
                return null;
        }
    };

    return (
        <Stack gap="xs">
            <Title>{t("Activities")}</Title>

            <Group gap="lg" px="md">
                <Chip.Group multiple value={states} onChange={onFilterChange(setStates) as (v: string[]) => void}>
                    <Group gap="xs">
                        {STATES.map(state => <Chip key={state} value={state} size="sm">{t(state)}</Chip>)}
                    </Group>
                </Chip.Group>
                <Chip.Group multiple value={types} onChange={onFilterChange(setTypes)}>
                    <Group gap="xs">
                        {TYPES.map(type => <Chip key={type} value={type} size="sm" color="grape">{t(type)}</Chip>)}
                    </Group>
                </Chip.Group>
            </Group>

            <LoadState error={error} loading={!items}>
                {items?.length === 0 && (
                    <Text px="md" c="dimmed">{t("No activities match the filters")}</Text>
                )}
            </LoadState>

            {items?.map(item => (
                <Card
                    key={item.id}
                    // Finished activities are dimmed; ongoing and upcoming keep
                    // full colour, which is the whole point of the state filter.
                    className={classes.item + " " + (item.state !== "finished" ? classes.active : "")}
                    // Its own page where somebody wrote one, its problems
                    // otherwise: the rule lives in one place so the list and the
                    // front page cannot come to disagree about it.
                    // **A locked card does not open.** The Server refuses
                    // everything under it anyway; navigating would land somebody
                    // on a page of refusals instead of on the reason.
                    onClick={() => { if (!item.locked) navigate(activityEntryPath(item)); }}
                    style={item.locked ? { cursor: "default" } : undefined}
                >
                    {/* The wrapping is in the stylesheet rather than in a
                        `wrap` prop. `Group` writes that prop as an inline
                        `--group-wrap`, which no media query can reach; a class
                        works by replacing the declaration that reads it, and
                        leaving both would be two rules fighting where only one
                        of them is visible. Below `sm` the details fall under
                        the name rather than being squeezed beside it. */}
                    <Group justify="space-between" className={classes.row}>
                        <Group wrap="nowrap" style={{ minWidth: 0 }}>
                            {getIcon(item.type)}
                            <Stack gap={2} style={{ minWidth: 0 }}>
                                <Text size="lg">{item.name}</Text>
                                <Group gap="xs">
                                    <Badge variant="outline" size="sm">{item.slug}</Badge>
                                    {membershipBadge(item)}
                                    {/* Shown rather than hidden, and saying
                                        which round did it: a row that vanished
                                        during an examination reads as a fault. */}
                                    {item.locked && (
                                        <Badge
                                            color="orange"
                                            variant="light"
                                            leftSection={<IconLock size={12} />}
                                        >
                                            {t("Locked by {{series}}", { series: item.locked.seriesName })}
                                        </Badge>
                                    )}
                                </Group>
                            </Stack>
                        </Group>
                        <Stack justify="flex-end" gap={0} className={classes.props} data-testid="activity-props">
                            {item.finalScore !== undefined && (
                                <Text fw={600}>
                                    {t("Result")}: {item.finalScore}{item.maxScore !== undefined ? ` / ${item.maxScore}` : ""}
                                </Text>
                            )}
                            {/* **Smaller on a phone, and only these.** A
                                responsive style prop rather than a rule in the
                                module: `Text` sets its size on its own class as
                                `var(--text-fz, …)`, which a parent font size
                                does not reach. The result above keeps its size
                                — it is a result, not a detail of the activity. */}
                            {displayProps(item.props).map(p => (
                                <Text key={p.key} fz={{ base: "xs", sm: "md" }} data-testid="activity-prop">{p.key}: {p.value}</Text>
                            ))}
                        </Stack>
                    </Group>
                </Card>
            ))}

            <Group justify="center" mt="xl">
                <Pagination
                    total={Math.ceil(total / PAGE_SIZE)}
                    value={page}
                    onChange={setPage}
                    mx="auto"
                />
            </Group>
        </Stack>
    );
}
