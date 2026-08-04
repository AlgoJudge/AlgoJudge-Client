import { Api } from "../Api";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { CoreApiHttp } from "./CoreApiHttp";
import { HttpClient } from "./HttpClient";
import { ManagerApiHttp } from "./ManagerApiHttp";
import { ParticipantApiHttp } from "./ParticipantApiHttp";

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
        return {
            authApi: new CoreApiHttp(http, coreEventDispatcher),
            participantApi: new ParticipantApiHttp(http),
            managerApi: new ManagerApiHttp(http),
        };
    }
}
