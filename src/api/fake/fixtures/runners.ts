import { ManagedRunner } from "../../ManagerApi";

/**
 * Runners, with the metadata each one reported about itself.
 *
 * The fields are the ones the earlier mock-up hard-coded — product, version,
 * supported problem types, address, key fingerprint — plus what `lscpu` and
 * `free` say about the machine. Nothing here is invented by the Server.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

export const createRunners = (): ManagedRunner[] => [
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        name: "Main runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["standard-io@1"],
        tags: ["all"],
        address: "192.168.1.1",
        fingerprint: "43:51:43:a1:b5:fc:8b:b7:0a:3a:a9:b1:0f:66:73:a8",
        state: "approved",
        isConnected: true,
        lastSeenAt: minutesAgo(0),
        registeredAt: daysAgo(120),
        approvedAt: daysAgo(120),
        machine: { os: "Debian 12", cpu: "AMD Ryzen 7 5800X", cores: 16, memoryMb: 32768 },
        currentSubmissionId: "msub-4",
        completedJobs: 8421,
    },
    {
        id: "7a1c0f52-9d84-4e37-b0aa-1c2f5d6e8b41",
        name: "Lab runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["standard-io@1"],
        tags: ["lab"],
        address: "192.168.1.24",
        fingerprint: "b2:0d:77:3e:41:9a:c5:18:6f:2b:84:d0:53:aa:1e:97",
        state: "approved",
        isConnected: true,
        lastSeenAt: minutesAgo(1),
        registeredAt: daysAgo(90),
        approvedAt: daysAgo(90),
        machine: { os: "Ubuntu 24.04", cpu: "Intel Core i5-12400", cores: 12, memoryMb: 16384 },
        completedJobs: 2140,
    },
    {
        // Approved but not connected: approval and connection are two different
        // things, and a screen that conflates them hides an outage.
        id: "c93b47ae-2f60-4d15-9e88-73a0b5c1def2",
        name: "Judge0 adapter",
        product: "AlgoJudge-Runner-Judge0",
        version: "0.2.0",
        problemTypes: ["standard-io@1", "interactive@9"],
        tags: ["judge0"],
        address: "10.0.4.7",
        fingerprint: "1f:88:d3:06:b7:4c:2a:95:e1:70:39:cb:6d:12:5f:a4",
        state: "approved",
        isConnected: false,
        lastSeenAt: daysAgo(3),
        registeredAt: daysAgo(60),
        approvedAt: daysAgo(60),
        machine: { os: "Alpine 3.20", cpu: "Intel Xeon E5-2680", cores: 8, memoryMb: 8192 },
        completedJobs: 317,
    },
    {
        // Waiting: it has registered a key and evaluates nothing until somebody
        // approves it.
        id: "6c31f9ad-528e-04b6-7719-e23d90c84b15",
        name: "Contest runner",
        product: "AlgoJudge-Runner",
        version: "0.0.2",
        problemTypes: ["standard-io@1"],
        tags: [],
        address: "10.0.4.19",
        fingerprint: "6c:31:f9:ad:52:8e:04:b6:77:19:e2:3d:90:c8:4b:15",
        state: "pendingApproval",
        isConnected: true,
        lastSeenAt: minutesAgo(2),
        registeredAt: minutesAgo(6),
        machine: { os: "Debian 12", cpu: "AMD EPYC 7302P", cores: 32, memoryMb: 65536 },
        completedJobs: 0,
    },
    {
        id: "0b6f3d74-8c15-4a92-a3e0-2d47915bc608",
        name: "Retired runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["standard-io@1"],
        tags: [],
        address: "10.0.4.31",
        fingerprint: "0b:6f:3d:74:8c:15:4a:92:a3:e0:2d:47:91:5b:c6:08",
        state: "revoked",
        isConnected: false,
        lastSeenAt: daysAgo(200),
        registeredAt: daysAgo(400),
        approvedAt: daysAgo(400),
        revokedAt: daysAgo(200),
        revokedReason: "Maszyna wycofana z eksploatacji",
        machine: { os: "Debian 11", cpu: "Intel Core i7-8700", cores: 12, memoryMb: 16384 },
        completedJobs: 5233,
    },
];
