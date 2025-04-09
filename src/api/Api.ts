import { CoreApi } from "./CoreApi";
import { ParticipantApi } from "./ParticipantApi";

export interface Api {
    authApi: CoreApi,
    participantApi: ParticipantApi,
}
