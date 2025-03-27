import { Anchor, Badge, Button, Code, Modal, Table, Tabs, Title } from '@mantine/core';
import { useState } from 'react';

const users = [
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        name: "Main runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["std", "c++"],
        tags: ["all", "contest1", "lab1"],
        ip: "192.168.1.1",
        status: "confirmed",
        blocked: undefined,
        connection: "online",
        fingerprint: "43:51:43:a1:b5:fc:8b:b7:0a:3a:a9:b1:0f:66:73:a8",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        name: "Main runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["std", "c++"],
        tags: ["all", "contest1", "lab1"],
        ip: "192.168.1.1",
        status: "confirmed",
        blocked: undefined,
        connection: "online",
        fingerprint: "43:51:43:a1:b5:fc:8b:b7:0a:3a:a9:b1:0f:66:73:a8",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        name: "Main runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["std", "c++"],
        tags: ["all", "contest1", "lab1"],
        ip: "192.168.1.1",
        status: "confirmed",
        blocked: undefined,
        connection: "online",
        fingerprint: "43:51:43:a1:b5:fc:8b:b7:0a:3a:a9:b1:0f:66:73:a8",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        name: "Main runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["std", "c++"],
        tags: ["all", "contest1", "lab1"],
        ip: "192.168.1.1",
        status: "confirmed",
        blocked: undefined,
        connection: "online",
        fingerprint: "43:51:43:a1:b5:fc:8b:b7:0a:3a:a9:b1:0f:66:73:a8",
        note: undefined
    },
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        name: "Main runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["std", "c++"],
        tags: ["all", "contest1", "lab1"],
        ip: "192.168.1.1",
        status: "confirmed",
        blocked: undefined,
        connection: "online",
        fingerprint: "43:51:43:a1:b5:fc:8b:b7:0a:3a:a9:b1:0f:66:73:a8",
        note: undefined
    }
]

const lscpuOutput =
`Architecture:        x86_64
CPU op-mode(s):      32-bit, 64-bit
Byte Order:          Little Endian
CPU(s):              4
On-line CPU(s) list: 0-3
Thread(s) per core:  2
Core(s) per socket:  2
Socket(s):           1
NUMA node(s):        1
Vendor ID:           GenuineIntel
CPU family:          6
Model:               61
Model name:          Intel(R) Core(TM) i5-5200U CPU @ 2.20GHz
Stepping:            4
CPU MHz:             971.253
CPU max MHz:         2700,0000
CPU min MHz:         500,0000
BogoMIPS:            4389.76
Virtualization:      VT-x
L1d cache:           32K
L1i cache:           32K
L2 cache:            256K
L3 cache:            3072K
NUMA node0 CPU(s):   0-3
Flags:               fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe
syscall nx pdpe1gb rdtscp lm constant_tsc arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor
ds_cpl vmx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm
3dnowprefetch cpuid_fault epb invpcid_single pti ssbd ibrs ibpb stibp tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 avx2
smep bmi2 erms invpcid rdseed adx smap intel_pt xsaveopt dtherm ida arat pln pts md_clear flush_l1d             
`

const freeOutput = 
`total    used      free   shared   buff/cache  available
                        
Mem:    8029356  794336   6297928   183384       937092    6816804
Swap:         0       0         0
`

const RunnerModal = (props: { runner: any, onClose: () => void }) => {
    if (!props.runner) return;
    return (
        <Modal opened={!!props.runner} onClose={props.onClose} title="Runner details" size="70%">
            <Tabs defaultValue="general">
                <Tabs.List>
                    <Tabs.Tab value="general">
                        General
                    </Tabs.Tab>
                    <Tabs.Tab value="proc">
                        Processor
                    </Tabs.Tab>
                    <Tabs.Tab value="mem">
                        Memory
                    </Tabs.Tab>
                    <Tabs.Tab value="logs">
                        Logs
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Table variant="vertical" layout="fixed" withTableBorder>
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Th>Id</Table.Th>
                                <Table.Td>{props.runner.id}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Td>{props.runner.name}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Product</Table.Th>
                                <Table.Td>{props.runner.product}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Version</Table.Th>
                                <Table.Td>{props.runner.version}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Supported problem types</Table.Th>
                                <Table.Td>{props.runner.problemTypes.join(", ")}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Tags</Table.Th>
                                <Table.Td>{props.runner.tags.map((tag: string) => <Badge variant="light" color="blue" size="md">{tag}</Badge>)}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>IP</Table.Th>
                                <Table.Td>{props.runner.ip}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Connection</Table.Th>
                                <Table.Td>{props.runner.connection}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Public key fingerprint</Table.Th>
                                <Table.Td><Code>{props.runner.fingerprint}</Code></Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Public key</Table.Th>
                                <Table.Td><Code>AAAAC3NzaC1lZDI1NTE5AAAAIAmzA7ZZl6oCe3yrEHL24w0O/sUwD7p6m7P57jKU3Pxm</Code></Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Status</Table.Th>
                                <Table.Td>{props.runner.status}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Blocked</Table.Th>
                                <Table.Td>{props.runner.blocked}</Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Th>Note</Table.Th>
                                <Table.Td>{props.runner.note}</Table.Td>
                            </Table.Tr>
                        </Table.Tbody>
                    </Table>
                    <Button>Block</Button>
                </Tabs.Panel>

                <Tabs.Panel value="proc">
                    <Code block>{lscpuOutput}</Code>
                </Tabs.Panel>

                <Tabs.Panel value="mem">
                    <Code block>{freeOutput}</Code>
                </Tabs.Panel>
            </Tabs>
        </Modal>
    );
}

const RunnersTable = (props: { setRunner: (runner: any) => void }) => {
    return (
        <Table highlightOnHover>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Id</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Product</Table.Th>
                    <Table.Th>Version</Table.Th>
                    <Table.Th>Supported problem types</Table.Th>
                    <Table.Th>Tags</Table.Th>
                    <Table.Th>IP</Table.Th>
                    <Table.Th>Connection</Table.Th>
                    <Table.Th>Public key fingerprint</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Blocked</Table.Th>
                    <Table.Th>Note</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {users.map((element) =>
                    <Table.Tr key={element.id}>
                        <Table.Td><Anchor onClick={() => props.setRunner(element)}>{element.id}</Anchor></Table.Td>
                        <Table.Td>{element.name}</Table.Td>
                        <Table.Td>{element.product}</Table.Td>
                        <Table.Td>{element.version}</Table.Td>
                        <Table.Td>{element.problemTypes.join(", ")}</Table.Td>
                        <Table.Td>{element.tags.map((tag: string) => <Badge variant="light" color="blue" size="sm">{tag}</Badge>)}</Table.Td>
                        <Table.Td>{element.ip}</Table.Td>
                        <Table.Td>{element.connection}</Table.Td>
                        <Table.Td><Code>{element.fingerprint}</Code></Table.Td>
                        <Table.Td>{element.status}</Table.Td>
                        <Table.Td>{element.blocked}</Table.Td>
                        <Table.Td>{element.note}</Table.Td>
                        <Table.Td>
                            <Button size="xs" onClick={() => props.setRunner(element)}>Details</Button>
                        </Table.Td>
                    </Table.Tr>)
                }
            </Table.Tbody>
        </Table>
    );
}

function RunnersPage() {
    const [runner, setRunner] = useState<any>();
    return (
        <>
            <Title>Runners</Title>
            <Title order={2}>Requests</Title>
            <RunnersTable setRunner={setRunner} />
            <Title order={2}>Active</Title>
            <RunnersTable setRunner={setRunner} />
            <Title order={2}>Inactive</Title>
            <RunnersTable setRunner={setRunner} />
            <RunnerModal runner={runner} onClose={() => setRunner(undefined)} />
        </>
    )
}

export default RunnersPage;
