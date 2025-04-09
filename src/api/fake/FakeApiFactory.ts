import { Api } from "../Api";
import { CoreApiFake } from "./CoreApiFake";
import { ParticipantApiFake } from "./ParticipantApiFake";

export class FakeApiFactory {
    public static create(): Api {
        return {
            authApi: new CoreApiFake(),
            participantApi: new ParticipantApiFake(),
        }
    }
}
