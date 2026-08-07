import { Grant } from "../ManagerApi";
import { signedInUserId } from "./CoreApiFake";
import { createGrants, MY_SYSTEM_PERMISSIONS, PERMISSION_CATALOGUE } from "./fixtures/permissions";
import { ME } from "./fixtures/problems";

/**
 * Who may do what, shared by both halves of the fake.
 *
 * Held apart from either API for the same reason `FakeActivities` is: the
 * manager screens **write** grants and the participant endpoints have to
 * **enforce** them. Two copies would let a permission that was revoked in one
 * screen still open a door in another — and the door this exists for is the
 * ranking feed, where `ranking:read:unfrozen` decides what leaves.
 *
 * The Server needs no such object. It has one authorisation and one database;
 * this exists so the fake cannot answer a question the Server would refuse.
 */
export class FakeAccess {
    /** Mutable: the grant editor adds, edits and revokes during a visit. */
    grants: Grant[] = createGrants();

    /** The account this browser is signed in as, or the fixtures' own manager. */
    me(): string {
        return signedInUserId() ?? ME;
    }

    /** What a user holds at system scope, before any activity grant. */
    systemPermissions(userId: string): string[] {
        if (userId === ME) return MY_SYSTEM_PERMISSIONS;
        const global = this.grants.find(g => g.userId === userId && g.activityId === undefined);
        if (!global) return [];
        // An administrator holds the catalogue; there is no list to keep in step
        // with it, which is the point of the permission being what it is.
        return global.permissions.includes("system:administrator")
            ? PERMISSION_CATALOGUE.map(definition => definition.key)
            : global.permissions;
    }

    /**
     * Whether the signed-in person holds a permission **in one activity**.
     *
     * Scoped, because holding it somewhere else is not holding it here: a
     * manager of one course must not read past the ranking window of a contest
     * they have nothing to do with. System scope carries into every activity,
     * which is what system scope means.
     */
    holds(permission: string, activityId: string): boolean {
        const me = this.me();
        if (this.systemPermissions(me).includes(permission)) return true;
        return this.grants.some(g =>
            g.userId === me && g.activityId === activityId && g.permissions.includes(permission));
    }
}
