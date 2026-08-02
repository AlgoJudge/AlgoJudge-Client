import { Anchor, Badge, Button, Code, Modal, Table, Tabs, Title } from '@mantine/core';
import { useState } from 'react';

/**
 * Shape of an account as the manager needs to see it. The Server exposes only
 * the email address today, so this page renders fixtures.
 */
export interface ManagedUser {
    id: string;
    username: string;
    name: string;
    email: string;
    tags: string[];
    status: "confirmed" | "pending" | "expired";
    blocked?: string;
    role: string;
    permissions: string;
    note?: string;
}

const users: ManagedUser[] = [
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        username: "john",
        name: "John Smith",
        email: "john.smith@algojudge.pl",
        tags: ["internal"],
        status: "confirmed",
        role: "admin",
        permissions: "all",
    },
    {
        id: "3f8a1c47-5b92-4e60-8d13-a7c04e2b9f56",
        username: "akowalska",
        name: "Anna Kowalska",
        email: "a.kowalska@example.edu.pl",
        tags: ["teacher"],
        status: "confirmed",
        role: "manager",
        permissions: "activity:manage",
    },
    {
        id: "b41d7e20-6c39-4a85-9f72-0e5138da4c93",
        username: "pnowak",
        name: "Piotr Nowak",
        email: "p.nowak@example.edu.pl",
        tags: ["student", "lab1"],
        status: "confirmed",
        role: "user",
        permissions: "activity:participate",
    },
    {
        id: "8c05fb3e-1a76-4d29-b4e8-92374f0ca1bd",
        username: "contest-042",
        name: "Temporary account 042",
        email: "",
        tags: ["temporary", "contest1"],
        status: "pending",
        role: "user",
        permissions: "activity:participate",
        note: "One-time account, expires after the contest",
    },
    {
        id: "d72e94a1-0f68-4b53-8c27-15ae63b0d849",
        username: "contest-017",
        name: "Temporary account 017",
        email: "",
        tags: ["temporary", "contest1"],
        status: "expired",
        blocked: "Expired 2025-04-02",
        role: "user",
        permissions: "activity:participate",
    },
]

const UserModal = (props: { user: ManagedUser | undefined, onClose: () => void }) => {
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
    const [user, setUser] = useState<ManagedUser | undefined>();
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
                            <Table.Td>{element.tags.map((tag: string) => <Badge key={tag} variant="light" color="blue" size="sm">{tag}</Badge>)}</Table.Td>
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
