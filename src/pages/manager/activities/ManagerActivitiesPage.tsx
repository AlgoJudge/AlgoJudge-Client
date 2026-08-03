import { useState } from "react";
import { Table, Title } from '@mantine/core';
import { useTranslation } from "react-i18next";
import { Activity } from "../../../api/ParticipantApi";
import { useApiEffect } from "../../../provider/ApiProvider";

export default function ManagerActivitiesPage() {
    const { t } = useTranslation();
    const [activities, setActivities] = useState<Activity[]>([]);

    useApiEffect(async (api) => {
        // A manager screen borrowing the participant API. It is out of scope for
        // the participant work and shows the first page only; it needs its own
        // manager endpoint rather than this.
        setActivities((await api.participantApi.getActivities({ pageSize: 50 })).items);
    });

    return (
        <>
            <Title>{t("Activities")}</Title>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Id</Table.Th>
                        <Table.Th>Slug</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>State</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {activities.map((element) =>
                        <Table.Tr key={element.id}>
                            <Table.Td>{element.id}</Table.Td>
                            <Table.Td>{element.slug}</Table.Td>
                            <Table.Td>{element.name}</Table.Td>
                            <Table.Td>{element.type}</Table.Td>
                            <Table.Td>{element.state}</Table.Td>
                        </Table.Tr>)
                    }
                </Table.Tbody>
            </Table>
        </>
    )
}
