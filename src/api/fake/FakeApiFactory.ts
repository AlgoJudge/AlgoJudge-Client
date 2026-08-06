import { Api } from "../Api";
import { NullEventConnection } from "../EventConnection";
import { CoreApiFake } from "./CoreApiFake";
import { FakeActivities } from "./FakeActivities";
import { FakeInstance } from "./FakeInstance";
import { FakeFiles, FileApiFake } from "./FileApiFake";
import { ManagerApiFake } from "./ManagerApiFake";
import { ParticipantApiFake } from "./ParticipantApiFake";

export class FakeApiFactory {
    public static create(): Api {
        // One store, as there is one on the Server: an operator's document, a
        // problem's figure and a Runner's log are the same row, told apart by
        // what references them. Handed to whoever seeds or reads bytes.
        const files = new FakeFiles();
        // And one instance, for the same reason: the manager screen writes what
        // the shell and the front page read.
        const instance = new FakeInstance(files);
        // And one owner for what an activity publishes and how somebody joins
        // it, because the manager screen writes exactly what the activity page
        // reads — two copies would let them disagree.
        const activities = new FakeActivities(files);
        return {
            authApi: new CoreApiFake(instance),
            participantApi: new ParticipantApiFake(files, activities),
            managerApi: new ManagerApiFake(files, instance, activities),
            fileApi: new FileApiFake(files),
            // The fake dispatches its own events as it changes things, so there
            // is no connection to open and nothing to pretend about.
            events: new NullEventConnection(),
        }
    }
}
