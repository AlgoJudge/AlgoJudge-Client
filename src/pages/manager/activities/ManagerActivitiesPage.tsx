import { useState } from "react";
import { Table, Title } from '@mantine/core';
import { useTranslation } from "react-i18next";
import { Activity } from "../../../api/ParticipantApi";
import { useApiEffect } from "../../../provider/ApiProvider";

export default function ManagerActivitiesPage() {
    const { t } = useTranslation();
    const [activities, setActivities] = useState<Activity[]>([]);

    useApiEffect(async (api) => {
        setActivities(await api.participantApi.getActivities());
    });

    return (
        <>
            <Title>{t("Activities")}</Title>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Id</Table.Th>
                        <Table.Th>Short</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Active</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {activities.map((element) =>
                        <Table.Tr key={element.id}>
                            <Table.Td>{element.id}</Table.Td>
                            <Table.Td>{element.short}</Table.Td>
                            <Table.Td>{element.name}</Table.Td>
                            <Table.Td>{element.type}</Table.Td>
                            <Table.Td>{String(element.isActive)}</Table.Td>
                        </Table.Tr>)
                    }
                </Table.Tbody>
            </Table>
        </>
    )
}
