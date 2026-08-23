import { Api } from "../Api";
import { NoAvailabilitySignal } from "../Availability";
import { NullEventConnection } from "../EventConnection";
import { CoreApiFake } from "./CoreApiFake";
import { FakeActivities } from "./FakeActivities";
import { FakeAccess } from "./FakeAccess";
import { FakeExclusions } from "./FakeExclusions";
import { WORLD } from "./fixtures/world";
import { FakeInstance } from "./FakeInstance";
import { FakeFiles, FileApiFake } from "./FileApiFake";
import { LtiApiFake } from "./LtiApiFake";
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
        // And one owner for the grants. The manager screens write them and the
        // participant endpoints enforce them — the ranking feed decides what
        // leaves from `ranking:read:unfrozen`, so a second copy would let a
        // revoked permission still open a door.
        const access = new FakeAccess();
        // And one owner for which submissions count. The manager rules and the
        // participant's board reads the ruling; two copies would leave a
        // submission ruled out in one screen and still scoring in another.
        const exclusions = new FakeExclusions(WORLD);
        return {
            authApi: new CoreApiFake(instance),
            participantApi: new ParticipantApiFake(files, activities, access, exclusions),
            managerApi: new ManagerApiFake(files, instance, activities, access, exclusions),
            fileApi: new FileApiFake(files),
            ltiApi: new LtiApiFake(),
            // The fake dispatches its own events as it changes things, so there
            // is no connection to open and nothing to pretend about.
            events: new NullEventConnection(),
            // Nothing to lose: the fake is in this browser. A window is reached
            // through `?fakeMaintenance=`, which its health call answers.
            availability: new NoAvailabilitySignal(),
        }
    }
}
