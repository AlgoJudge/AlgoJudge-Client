import { ManagedRunner, RunnerAttachment } from "../../ManagerApi";
import type { FakeFiles } from "../FileApiFake";
import { fakeSha } from "./problems";

/**
 * Runners, with the metadata each one reported about itself.
 *
 * The fields are the ones the earlier mock-up hard-coded — product, version,
 * supported problem types, address, public key — plus the files each Runner
 * uploaded about itself. Nothing here is invented by the Server: the machine
 * reports are ordinary attachments, and the panel renders whichever it finds.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

/**
 * Puts one attachment into the shared file store and answers with the reference.
 *
 * **Into the same store as everything else**, because that is where the panel
 * now reads it from: a Runner's log is fetched through `fileApi.getText(id)`
 * like any other stored file, since the second endpoint that used to serve it
 * was removed on 2026-08-12. A private map here would be a second store, and
 * the screen would ask the first one and find nothing.
 */
const attach = (
    files: FakeFiles, runnerId: string, name: string, uploadedAt: string, body: string,
): RunnerAttachment => {
    const id = `file-${runnerId.slice(0, 8)}-${name}`;
    files.put(id, name, "text/plain", new Blob([body], { type: "text/plain" }), fakeSha(id));
    return {
        id,
        name,
        mimeType: "text/plain",
        sizeBytes: body.length,
        sha256: fakeSha(id),
        uploadedAt,
    };
};

const LSCPU = `Architecture:        x86_64
CPU op-mode(s):      32-bit, 64-bit
Byte Order:          Little Endian
CPU(s):              16
On-line CPU(s) list: 0-15
Thread(s) per core:  2
Core(s) per socket:  8
Socket(s):           1
NUMA node(s):        1
Vendor ID:           AuthenticAMD
CPU family:          25
Model:               33
Model name:          AMD Ryzen 7 5800X 8-Core Processor
Stepping:            2
CPU MHz:             3800.000
CPU max MHz:         4850,0000
CPU min MHz:         2200,0000
BogoMIPS:            7602.66
Virtualization:      AMD-V
L1d cache:           256 KiB
L1i cache:           256 KiB
L2 cache:            4 MiB
L3 cache:            32 MiB
NUMA node0 CPU(s):   0-15
Flags:               fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov
                     pat pse36 clflush mmx fxsr sse sse2 ht syscall nx mmxext
                     fxsr_opt pdpe1gb rdtscp lm constant_tsc rep_good nopl xtopology
                     cpuid extd_apicid aperfmperf pni pclmulqdq monitor ssse3 fma cx16
                     sse4_1 sse4_2 x2apic movbe popcnt aes xsave avx f16c rdrand
`;

const FREE = `               total        used        free      shared  buff/cache   available
Mem:        32796160     4192764    24310112      189440     4293284    28063396
Swap:        8388604           0     8388604
`;

const LOG = `2026-08-04 17:58:11 INFO  runner: connected to https://api.algojudge.app/api/v1
2026-08-04 17:58:11 INFO  runner: reporting standard-io@1
2026-08-04 17:59:02 INFO  job 018f2c00-…-msub-4: claimed, lease 60s
2026-08-04 17:59:02 INFO  job 018f2c00-…-msub-4: package 1f8ac2… served from cache ch/ec/ks
2026-08-04 17:59:04 INFO  job 018f2c00-…-msub-4: compiled in 1.8s
2026-08-04 17:59:06 INFO  job 018f2c00-…-msub-4: test 1a OK 0.12s 12MB
2026-08-04 17:59:07 INFO  job 018f2c00-…-msub-4: test 1b OK 0.12s 12MB
`;


export const createRunners = (files: FakeFiles): ManagedRunner[] => [
    {
        id: "e55fd089-61d2-4b44-83ef-466d35117975",
        name: "Main runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["standard-io@1"],
        // Written out rather than left empty: both mean the general pool, and
        // a screen has to be able to show that they do.
        tags: ["default"],
        address: "192.168.1.1",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIAmzA7ZZl6oCe3yrEHL24w0O/sUwD7p6m7P57jKU3Pxm",
        fingerprint: "43:51:43:a1:b5:fc:8b:b7:0a:3a:a9:b1:0f:66:73:a8",
        state: "approved",
        isConnected: true,
        lastSeenAt: minutesAgo(0),
        registeredAt: daysAgo(120),
        approvedAt: daysAgo(120),
        machine: { os: "Debian 12", cpu: "AMD Ryzen 7 5800X", cores: 16, memoryBytes: 32768 * 1024 * 1024 },
        currentSubmissionId: "msub-4",
        completedJobs: 8421,
        attachments: [
            attach(files, "e55fd089", "lscpu.txt", minutesAgo(0), LSCPU),
            attach(files, "e55fd089", "free.txt", minutesAgo(0), FREE),
            attach(files, "e55fd089", "runner.log", minutesAgo(0), LOG),
        ],
    },
    {
        id: "7a1c0f52-9d84-4e37-b0aa-1c2f5d6e8b41",
        name: "Lab runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["standard-io@1"],
        // **Reserved.** Tagging a Runner takes it out of the general pool as
        // well as putting it in this one, which is what the examination in
        // `KOLOKWIUM-2` relies on.
        tags: ["lab-a"],
        address: "192.168.1.24",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB7uHqfWjLTz1p0nQKcQ2mF3xCkq8Rk7YvJm1sN0oPqR",
        fingerprint: "b2:0d:77:3e:41:9a:c5:18:6f:2b:84:d0:53:aa:1e:97",
        state: "approved",
        isConnected: true,
        lastSeenAt: minutesAgo(1),
        registeredAt: daysAgo(90),
        approvedAt: daysAgo(90),
        machine: { os: "Ubuntu 24.04", cpu: "Intel Core i5-12400", cores: 12, memoryBytes: 16384 * 1024 * 1024 },
        completedJobs: 2140,
        attachments: [
            attach(files, "7a1c0f52", "lscpu.txt", minutesAgo(1), LSCPU),
            attach(files, "7a1c0f52", "free.txt", minutesAgo(1), FREE),
        ],
    },
    {
        // Approved but not connected: approval and connection are two different
        // things, and a screen that conflates them hides an outage.
        id: "c93b47ae-2f60-4d15-9e88-73a0b5c1def2",
        name: "Judge0 adapter",
        product: "AlgoJudge-Runner-Judge0",
        version: "0.2.0",
        problemTypes: ["standard-io@1", "interactive@9"],
        tags: ["default"],
        address: "10.0.4.7",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIC9pQ2wRzT4vX8mK1nB5hD7sL0aF6yE3uJ2cV4rG8iOd",
        fingerprint: "1f:88:d3:06:b7:4c:2a:95:e1:70:39:cb:6d:12:5f:a4",
        state: "approved",
        isConnected: false,
        lastSeenAt: daysAgo(3),
        registeredAt: daysAgo(60),
        approvedAt: daysAgo(60),
        machine: { os: "Alpine 3.20", cpu: "Intel Xeon E5-2680", cores: 8, memoryBytes: 8192 * 1024 * 1024 },
        completedJobs: 317,
        // Offline for three days: the report is what it uploaded when it last
        // connected, and is shown as such rather than hidden.
        attachments: [attach(files, "c93b47ae", "lscpu.txt", daysAgo(3), LSCPU)],
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
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIE4tR9xQ0bS6yH3kM8pW2fN5vC7zA1jU6dL0oT9gX2eB",
        fingerprint: "6c:31:f9:ad:52:8e:04:b6:77:19:e2:3d:90:c8:4b:15",
        state: "pendingApproval",
        isConnected: true,
        lastSeenAt: minutesAgo(2),
        registeredAt: minutesAgo(6),
        machine: { os: "Debian 12", cpu: "AMD EPYC 7302P", cores: 32, memoryBytes: 65536 * 1024 * 1024 },
        completedJobs: 0,
        attachments: [
            attach(files, "6c31f9ad", "lscpu.txt", minutesAgo(6), LSCPU),
            attach(files, "6c31f9ad", "free.txt", minutesAgo(6), FREE),
        ],
    },
    {
        id: "0b6f3d74-8c15-4a92-a3e0-2d47915bc608",
        name: "Retired runner",
        product: "AlgoJudge-Runner",
        version: "0.0.1",
        problemTypes: ["standard-io@1"],
        tags: [],
        address: "10.0.4.31",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIF2nH8kP1wR7tY4qL6bM0jV3xZ5cD9sA2eG7uO1iK4pT",
        fingerprint: "0b:6f:3d:74:8c:15:4a:92:a3:e0:2d:47:91:5b:c6:08",
        state: "revoked",
        isConnected: false,
        lastSeenAt: daysAgo(200),
        registeredAt: daysAgo(400),
        approvedAt: daysAgo(400),
        revokedAt: daysAgo(200),
        revokedReason: "Maszyna wycofana z eksploatacji",
        machine: { os: "Debian 11", cpu: "Intel Core i7-8700", cores: 12, memoryBytes: 16384 * 1024 * 1024 },
        completedJobs: 5233,
        // Revoked: nothing was uploaded after it stopped connecting, and the
        // panel shows a Runner with no tabs rather than empty ones.
        attachments: [],
    },
];
