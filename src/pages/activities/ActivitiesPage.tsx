import { Card, Stack, Title, Text, Group, Pagination, Loader } from "@mantine/core";
import { IconSchool, IconTrophy } from "@tabler/icons-react";
import classes from "./ActivitiesPage.module.css"
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Activity } from "../../api/ParticipantApi";
import { useApiEffect } from "../../provider/ApiProvider";
import { SortedList } from "../../utils/SortedList"

const MAX_ITEMS_PER_PAGE = 5;

const getIcon = (type: string) => {
    switch (type) {
        case "contest":
            return <IconTrophy size="3em" />;
        case "course":
            return <IconSchool size="3em" />;
        default:
            return <IconSchool size="3em" />;
    }
}

export default function ActivitiesPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [data, setData] = useState<Activity[]>();
    const [page, setPage] = useState<number>(1);
    const sortedList: SortedList<Activity, string> = new SortedList(a => a.id, (a, b) => a.id.localeCompare(b.id), setData);
    useApiEffect(async (api) => {
        const getData = async () => {
            const data = await api.participantApi.getActivities();
            sortedList.addOrUpdate(data);
        }
        api.participantApi.eventDispatcher.addEventListener("activityCreated", evt => sortedList.addOrUpdate([evt.data.activity]));
        api.participantApi.eventDispatcher.addEventListener("activityUpdated", evt => sortedList.addOrUpdate([evt.data.activity]));
        await getData();
    });
    const pages = data ? Math.ceil(data.length / MAX_ITEMS_PER_PAGE) : 0;
    const list = data && (() => {
        const firstItem = MAX_ITEMS_PER_PAGE * (page - 1);
        const list = data.slice(firstItem, firstItem + MAX_ITEMS_PER_PAGE).map(item =>
            <Card key={item.id} className={classes.item + " " + (item.isActive && classes.active)} onClick={() => navigate(`/activities/${item.id}/problems`)}>
                <Group justify="space-between">
                    <Group>
                        {getIcon(item.type)}<Text size="lg">{item.name}</Text>
                    </Group>
                    <Stack justify="flex-end" gap={0} className={classes.stack}>
                        {item.props.map(p => <Text key={p.key}>{p.key}: {p.value}</Text>)}
                    </Stack>
                </Group>
            </Card>
        );
        return list;
    })();
    return (
        <>
            <Title>{t("Activities")}</Title>
            {list}
            {!data && <Loader color="blue" size="xl" />}
            <Group justify="center" mt="xl">
                <Pagination total={pages} value={page} onChange={setPage} mx="auto" />
            </Group>
        </>
    );
}
