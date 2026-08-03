import { Badge, Card, Center, Chip, Group, Loader, Pagination, Stack, Text, Title } from "@mantine/core";
import { IconQuestionMark, IconSchool, IconTrophy } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Activity, ActivityState } from "../../api/ParticipantApi";
import { useApiEffect } from "../../provider/ApiProvider";
import { typeName } from "../../renderers";
import classes from "./ActivitiesPage.module.css";

const PAGE_SIZE = 5;

const getIcon = (type: string) => {
    // The icon follows the type's name, so a new version of a known type keeps
    // its icon instead of falling through to the default.
    switch (typeName(type)) {
        case "contest":
            return <IconTrophy size="3em" />;
        case "course":
            return <IconSchool size="3em" />;
        default:
            return <IconQuestionMark size="3em" />;
    }
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
    useApiEffect(async (api) => {
        setItems(undefined);
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
    }, [page, states.join(","), types.join(","), reload]);

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

            {!items && <Center my="xl"><Loader size="xl" /></Center>}

            {items?.length === 0 && (
                <Text px="md" c="dimmed">{t("No activities match the filters")}</Text>
            )}

            {items?.map(item => (
                <Card
                    key={item.id}
                    // Finished activities are dimmed; ongoing and upcoming keep
                    // full colour, which is the whole point of the state filter.
                    className={classes.item + " " + (item.state !== "finished" ? classes.active : "")}
                    onClick={() => navigate(`/activities/${item.slug}/problems`)}
                >
                    <Group justify="space-between" wrap="nowrap">
                        <Group wrap="nowrap" style={{ minWidth: 0 }}>
                            {getIcon(item.type)}
                            <Stack gap={2} style={{ minWidth: 0 }}>
                                <Text size="lg">{item.name}</Text>
                                <Group gap="xs">
                                    <Badge variant="outline" size="sm">{item.slug}</Badge>
                                    {membershipBadge(item)}
                                </Group>
                            </Stack>
                        </Group>
                        <Stack justify="flex-end" gap={0} className={classes.stack}>
                            {item.finalScore !== undefined && (
                                <Text fw={600}>
                                    {t("Result")}: {item.finalScore}{item.maxScore !== undefined ? ` / ${item.maxScore}` : ""}
                                </Text>
                            )}
                            {item.props.map(p => <Text key={p.key}>{p.key}: {p.value}</Text>)}
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
