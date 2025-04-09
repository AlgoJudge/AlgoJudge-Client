import { ParticipantEventDispatcherImpl } from "../impl/ParticipantEventDispatcher";
import { Activity, ParticipantApi } from "../ParticipantApi";
import { Utils } from "./Utils";
import { faker } from "@faker-js/faker"

const data: Activity[] = [
    {
        id: "PCN1",
        type: "contest",
        isActive: true,
        short: "PCN1",
        name: "Programming Contest No 1",
        props: []
    },
    {
        id: "PC1",
        type: "course",
        isActive: true,
        short: "PC1",
        name: "Programming course",
        props: [
            {
                key: "Group",
                value: "LA"
            },
            {
                key: "Teacher",
                value: "John Smith"
            },
        ]
    },
    {
        id: "PCN2",
        type: "contest",
        isActive: true,
        short: "PCN2",
        name: "Programming Contest No 2",
        props: []
    },
    {
        id: "PCN3",
        type: "contest",
        isActive: false,
        short: "PCN3",
        name: "Programming Contest No 3",
        props: []
    },
    {
        id: "APC",
        type: "course",
        isActive: true,
        short: "APC",
        name: "Advanced programming course",
        props: []
    },
    {
        id: "PCN4",
        type: "contest",
        isActive: true,
        short: "PCN4",
        name: "Programming Contest No 4",
        props: []
    },
    {
        id: "PCN5",
        type: "contest",
        isActive: false,
        short: "PCN5",
        name: "Programming Contest No 5",
        props: []
    },
    {
        id: "APC2",
        type: "course",
        isActive: true,
        short: "APC2",
        name: "Advanced programming course II",
        props: []
    },
];

class FakeActivitiesService {
    private activities: Activity[] | undefined = undefined;
    constructor(private eventDispatcher: ParticipantEventDispatcherImpl) {}
    getActivities(): Activity[] {
        this.ensureActivitiesCreated();
        return this.activities!;
    }
    getActivity(id: string): Activity {
        this.ensureActivitiesCreated();
        return this.activities!.find(a => a.id === id) ?? Utils.throwError("Activity does not exist");
    }

    private ensureActivitiesCreated() {
        if (!this.activities) {
            this.activities = [];
            this.generateActivities();
            this.startLoop();
        }
    }

    private async generateActivities() {
        for (const activity of data) {
            await Utils.sleep(400);
            this.activities = [{...activity, name: faker.commerce.productName()}, ...this.activities!];
            this.eventDispatcher.dispatchActivityCreatedEvent({activity});
        }
    }

    private async startLoop() {
        while (true) {
            await Utils.sleep(1000);
            this.activities = [{...this.activities![0], name: faker.commerce.productName()}, ...this.activities!.slice(1)];
            this.eventDispatcher.dispatchActivityUpdatedEvent({activity: this.activities[0]});
        }
    }
}

export class ParticipantApiFake implements ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcherImpl = new ParticipantEventDispatcherImpl();
    private readonly fakeService: FakeActivitiesService = new FakeActivitiesService(this.eventDispatcher);
    constructor(private sleepMs: number = 700) {}
    async getActivities(signal: AbortSignal): Promise<Activity[]> {
        // await this.sleep();
        signal.throwIfAborted();
        return this.fakeService.getActivities();
    }
    async getActivity(id: string, signal: AbortSignal): Promise<Activity> {
        // await this.sleep();
        signal.throwIfAborted();
        return this.fakeService.getActivity(id);
    }
    private sleep(): Promise<void> {
        return Utils.sleep(this.sleepMs);
    }
}
