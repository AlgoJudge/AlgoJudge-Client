import { Api } from "../Api";
import { CoreApiFake } from "./CoreApiFake";
import { FakeFiles, FileApiFake } from "./FileApiFake";
import { ManagerApiFake } from "./ManagerApiFake";
import { ParticipantApiFake } from "./ParticipantApiFake";

export class FakeApiFactory {
    public static create(): Api {
        // One store, as there is one on the Server: an operator's document, a
        // problem's figure and a Runner's log are the same row, told apart by
        // what references them. Handed to whoever seeds or reads bytes.
        const files = new FakeFiles();
        return {
            authApi: new CoreApiFake(files),
            participantApi: new ParticipantApiFake(),
            managerApi: new ManagerApiFake(files),
            fileApi: new FileApiFake(files),
        }
    }
}
