import { Activity, ParticipantApi } from "../ParticipantApi";
import { ParticipantEventDispatcherImpl } from "../impl/ParticipantEventDispatcher";
import { HttpClient } from "./HttpClient";

/** Shape returned by the Server's `/activity/list` endpoint. */
interface ServerActivityInfo {
    id: number | string;
    shortName: string;
    name: string;
    type: string;
    startDate?: string | null;
    endDate?: string | null;
}

function isWithinDates(info: ServerActivityInfo): boolean {
    const now = Date.now();
    if (info.startDate) {
        const start = Date.parse(info.startDate);
        if (!Number.isNaN(start) && now < start) return false;
    }
    if (info.endDate) {
        const end = Date.parse(info.endDate);
        if (!Number.isNaN(end) && now > end) return false;
    }
    return true;
}

/**
 * Maps the Server representation onto the Client model.
 *
 * The Server still uses integer keys, so the identifier is stringified here.
 * Once the Server moves to string UUIDs this mapping becomes a pass-through.
 * `props` stays empty because the Server has no per-type property bag yet.
 */
function toActivity(info: ServerActivityInfo): Activity {
    return {
        id: String(info.id),
        type: info.type,
        isActive: isWithinDates(info),
        short: info.shortName,
        name: info.name,
        props: [],
    };
}

export class ParticipantApiHttp implements ParticipantApi {
    readonly eventDispatcher: ParticipantEventDispatcherImpl = new ParticipantEventDispatcherImpl();

    constructor(private readonly http: HttpClient) { }

    async getActivities(signal: AbortSignal): Promise<Activity[]> {
        const list = await this.http.request<ServerActivityInfo[]>("/activity/list", "GET", { signal });
        return list.map(toActivity);
    }

    /**
     * The Server has no single-activity endpoint yet, so this filters the list.
     * Replace with a direct request once `/activity/{id}` exists.
     */
    async getActivity(id: string, signal: AbortSignal): Promise<Activity> {
        const activities = await this.getActivities(signal);
        const activity = activities.find(a => a.id === id);
        if (!activity) {
            throw new Error(`Activity ${id} does not exist`);
        }
        return activity;
    }
}
