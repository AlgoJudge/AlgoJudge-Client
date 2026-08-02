import { Api } from "../Api";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";
import { CoreApiHttp } from "./CoreApiHttp";
import { HttpClient } from "./HttpClient";
import { ParticipantApiHttp } from "./ParticipantApiHttp";

export class HttpApiFactory {
    public static create(baseUrl: string): Api {
        const coreEventDispatcher = new CoreEventDispatcherImpl();
        const http = new HttpClient(baseUrl, (message, type) =>
            coreEventDispatcher.dispatchEvent({
                type: "systemMessage",
                data: { message, type },
            })
        );
        return {
            authApi: new CoreApiHttp(http, coreEventDispatcher),
            participantApi: new ParticipantApiHttp(http),
        };
    }
}
