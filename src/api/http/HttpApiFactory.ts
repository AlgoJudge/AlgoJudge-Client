import { Api } from "../Api";
import { AvailabilitySignal } from "../Availability";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { CoreApiHttp } from "./CoreApiHttp";
import { FileApiHttp } from "./FileApiHttp";
import { HttpClient } from "./HttpClient";
import { LtiApiHttp } from "./LtiApiHttp";
import { ManagerApiHttp } from "./ManagerApiHttp";
import { ParticipantApiHttp } from "./ParticipantApiHttp";
import { eventUrl, WebSocketEvents } from "../ws/WebSocketEvents";

export class HttpApiFactory {
    public static create(baseUrl: string): Api {
        const coreEventDispatcher = new CoreEventDispatcherImpl();
        const availability = new AvailabilitySignal();
        const http = new HttpClient(
            baseUrl,
            (message, type) => coreEventDispatcher.dispatchEvent({
                type: "systemMessage",
                data: { message, type },
            }),
            // A 401 is not a message to show; it is a session that ended, and the
            // provider has to hear about it.
            () => coreEventDispatcher.dispatchEvent({ type: "sessionExpired", data: {} }),
            // And a 503 is neither: it is the whole installation being away,
            // which the shell answers and no screen does.
            error => availability.report(error),
        );
        const participantApi = new ParticipantApiHttp(http);
        const managerApi = new ManagerApiHttp(http);
        return {
            authApi: new CoreApiHttp(http, coreEventDispatcher),
            participantApi,
            managerApi,
            fileApi: new FileApiHttp(http, baseUrl),
            ltiApi: new LtiApiHttp(http),
            // One socket for all three, built here because this is where all
            // three dispatchers exist. It stays shut until somebody signs in.
            events: new WebSocketEvents(
                eventUrl(baseUrl),
                coreEventDispatcher,
                participantApi.eventDispatcher,
                managerApi.eventDispatcher,
            ),
            availability,
        };
    }
}
