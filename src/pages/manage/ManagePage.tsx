import { useState } from "react";
import { Table } from '@mantine/core';
import { Activity } from "../../api/ParticipantApi";
import { useApiEffect } from "../../provider/ApiProvider";

function ManagePage() {

    const [activities, setActivities] = useState<Activity[]>([]);

    useApiEffect(async (api) => {
        setActivities(await api.participantApi.getActivities());
    });

    return (
        <>
            <h1>Manage</h1>
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

export default ManagePage;
