import { Anchor, Badge, Button, Code, Modal, Table, Tabs, Title } from '@mantine/core';
import { useState } from 'react';

const users = [
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        username: "john",
        name: "John Smith",
        email: "john.smith@algojudge.pl",
        tags: ["internal"],
        status: "confirmed",
        blocked: undefined,
        role: "admin",
        permissions: "all",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        username: "john",
        name: "John Smith",
        email: "john.smith@algojudge.pl",
        tags: ["internal"],
        status: "confirmed",
        blocked: undefined,
        role: "admin",
        permissions: "all",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        username: "john",
        name: "John Smith",
        email: "john.smith@algojudge.pl",
        tags: ["internal"],
        status: "confirmed",
        blocked: undefined,
        role: "admin",
        permissions: "all",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        username: "john",
        name: "John Smith",
        email: "john.smith@algojudge.pl",
        tags: ["internal"],
        status: "confirmed",
        blocked: undefined,
        role: "admin",
        permissions: "all",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        username: "john",
        name: "John Smith",
        email: "john.smith@algojudge.pl",
        tags: ["internal"],
        status: "confirmed",
        blocked: undefined,
        role: "admin",
        permissions: "all",
        note: undefined
    }
]

const UserModal = (props: { user: any, onClose: () => void }) => {
    if (!props.user) return;
    return (
        <Modal opened={!!props.user} onClose={props.onClose} title="User details" size="70%">
            <Tabs defaultValue="general">
                <Tabs.List>
                    <Tabs.Tab value="general">
                        General
                    </Tabs.Tab>
                    <Tabs.Tab value="unix">
                        Unix
                    </Tabs.Tab>
                    <Tabs.Tab value="sessions">
                        Sessions
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Table variant="vertical" layout="fixed" withTableBorder>
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Th>Id</Table.Th>
                                <Table.Td>{props.user.id}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Username</Table.Th>
                                <Table.Td>{props.user.username}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Td>{props.user.name}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>E-mail</Table.Th>
                                <Table.Td>{props.user.email}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Status</Table.Th>
                                <Table.Td>{props.user.status}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Tags</Table.Th>
                                <Table.Td>{props.user.tags.map((tag: string) => <Badge variant="light" color="blue" size="md">{tag}</Badge>)}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Status</Table.Th>
                                <Table.Td>{props.user.status}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Blocked</Table.Th>
                                <Table.Td>{props.user.blocked}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Role</Table.Th>
                                <Table.Td>{props.user.role}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Permissions</Table.Th>
                                <Table.Td>{props.user.permissions}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Note</Table.Th>
                                <Table.Td>{props.user.note}</Table.Td>
                            </Table.Tr>
                        </Table.Tbody>
                    </Table>
                    <Button>Block</Button>
                </Tabs.Panel>

                <Tabs.Panel value="unix">
                <Table variant="vertical" layout="fixed" withTableBorder>
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Th>User ID</Table.Th>
                                <Table.Td>10000</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Login</Table.Th>
                                <Table.Td><Code>aj10000</Code></Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Password</Table.Th>
                                <Table.Td><Code>ux7Xahsh</Code></Table.Td>
                            </Table.Tr>
                        </Table.Tbody>
                    </Table>
                </Tabs.Panel>

                <Tabs.Panel value="session">
                    Last session:
                </Tabs.Panel>
            </Tabs>
        </Modal>
    );
}

function UsersPage() {
    const [user, setUser] = useState<any>();
    return (
        <>
            <Title>Users</Title>
            <Table highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Id</Table.Th>
                        <Table.Th>Username</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>E-mail</Table.Th>
                        <Table.Th>Tags</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Blocked</Table.Th>
                        <Table.Th>Role</Table.Th>
                        <Table.Th>Permissions</Table.Th>
                        <Table.Th>Note</Table.Th>
                        <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {users.map((element) =>
                        <Table.Tr key={element.id}>
                            <Table.Td><Anchor onClick={() => setUser(element)}>{element.id}</Anchor></Table.Td>
                            <Table.Td>{element.username}</Table.Td>
                            <Table.Td>{element.name}</Table.Td>
                            <Table.Td>{element.email}</Table.Td>
                            <Table.Td>{element.tags.map((tag: string) => <Badge variant="light" color="blue" size="sm">{tag}</Badge>)}</Table.Td>
                            <Table.Td>{element.status}</Table.Td>
                            <Table.Td>{element.blocked}</Table.Td>
                            <Table.Td>{element.role}</Table.Td>
                            <Table.Td>{element.permissions}</Table.Td>
                            <Table.Td>{element.note}</Table.Td>
                            <Table.Td>
                                <Button size="xs" onClick={() => setUser(element)}>Details</Button>
                            </Table.Td>
                        </Table.Tr>)
                    }
                </Table.Tbody>
            </Table>
            <UserModal user={user} onClose={() => setUser(undefined)} />
        </>
    )
}

export default UsersPage;
