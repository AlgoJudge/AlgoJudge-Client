import { CoreApi } from "./CoreApi";
import { EventConnection } from "./EventConnection";
import { FileApi } from "./FileApi";
import { ManagerApi } from "./ManagerApi";
import { ParticipantApi } from "./ParticipantApi";

export interface Api {
    authApi: CoreApi,
    participantApi: ParticipantApi,
    managerApi: ManagerApi,
    /**
     * Stored bytes, shared by every audience above: an operator's documents, a
     * problem's figures and package, a Runner's own uploads. Its own member
     * because a file belongs to no one of them — what a file is for is decided
     * by what references it.
     */
    fileApi: FileApi,
    /**
     * The live connection behind the three event dispatchers. Started when a
     * session exists and stopped when it ends; the screens read the dispatchers
     * and never touch this.
     */
    events: EventConnection,
}
