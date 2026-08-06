import { Api } from "../Api";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { CoreApiHttp } from "./CoreApiHttp";
import { FileApiHttp } from "./FileApiHttp";
import { HttpClient } from "./HttpClient";
import { ManagerApiHttp } from "./ManagerApiHttp";
import { ParticipantApiHttp } from "./ParticipantApiHttp";
import { eventUrl, WebSocketEvents } from "../ws/WebSocketEvents";

export class HttpApiFactory {
    public static create(baseUrl: string): Api {
        const coreEventDispatcher = new CoreEventDispatcherImpl();
        const http = new HttpClient(
            baseUrl,
            (message, type) => coreEventDispatcher.dispatchEvent({
                type: "systemMessage",
                data: { message, type },
            }),
            // A 401 is not a message to show; it is a session that ended, and the
            // provider has to hear about it.
            () => coreEventDispatcher.dispatchEvent({ type: "sessionExpired", data: {} }),
        );
        const participantApi = new ParticipantApiHttp(http);
        const managerApi = new ManagerApiHttp(http);
        return {
            authApi: new CoreApiHttp(http, coreEventDispatcher),
            participantApi,
            managerApi,
            fileApi: new FileApiHttp(http, baseUrl),
            // One socket for all three, built here because this is where all
            // three dispatchers exist. It stays shut until somebody signs in.
            events: new WebSocketEvents(
                eventUrl(baseUrl),
                coreEventDispatcher,
                participantApi.eventDispatcher,
                managerApi.eventDispatcher,
            ),
        };
    }
}
