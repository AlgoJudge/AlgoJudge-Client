import { CoreApi } from "./CoreApi";
import { ManagerApi } from "./ManagerApi";
import { ParticipantApi } from "./ParticipantApi";

export interface Api {
    authApi: CoreApi,
    participantApi: ParticipantApi,
    managerApi: ManagerApi,
}
