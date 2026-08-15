import {
    DeepLinkAnswer, DeepLinkChoosing, GradeSummary, LaunchContext, LtiApi, Placement, Platform,
    PlatformInput, RegistrationInvitation, RosterEnrolment, RosterView, ToolRegistration,
} from "../LtiApi";
import { HttpClient } from "./HttpClient";

/**
 * The LTI module's endpoints, over REST.
 *
 * They live under `/lti` on the Server and are served by a module a deployment
 * may not have — so every call here can legitimately answer 404, and the
 * screens treat that as "this installation has no LMS integration" rather than
 * as a fault.
 */
export class LtiApiHttp implements LtiApi {
    constructor(private readonly http: HttpClient) { }

    listPlatforms(signal: AbortSignal): Promise<Platform[]> {
        return this.http.request<Platform[]>("/lti/platforms", "GET", { signal });
    }

    registerPlatform(input: PlatformInput, signal: AbortSignal): Promise<Platform> {
        return this.http.request<Platform>("/lti/platforms", "POST", { signal, body: input });
    }

    updatePlatform(id: string, input: PlatformInput, signal: AbortSignal): Promise<Platform> {
        return this.http.request<Platform>(
            `/lti/platforms/${encodeURIComponent(id)}`, "PUT", { signal, body: input });
    }

    async deletePlatform(id: string, signal: AbortSignal): Promise<void> {
        await this.http.request<void>(
            `/lti/platforms/${encodeURIComponent(id)}`, "DELETE", { signal });
    }

    getRegistration(id: string, signal: AbortSignal): Promise<ToolRegistration> {
        return this.http.request<ToolRegistration>(
            `/lti/platforms/${encodeURIComponent(id)}/registration`, "GET", { signal });
    }

    claimLaunch(ticket: string, signal: AbortSignal): Promise<LaunchContext> {
        return this.http.request<LaunchContext>("/lti/session/claim", "POST", {
            signal,
            body: { ticket },
        });
    }

    getGrades(linkId: string, verify: boolean, signal: AbortSignal): Promise<GradeSummary> {
        const query = verify ? "?verify=true" : "";
        return this.http.request<GradeSummary>(
            `/lti/placements/${encodeURIComponent(linkId)}/grades${query}`, "GET", { signal });
    }

    async resyncGrades(linkId: string, signal: AbortSignal): Promise<number> {
        const answer = await this.http.request<{ queued: number }>(
            `/lti/placements/${encodeURIComponent(linkId)}/grades/resync`, "POST", { signal });
        return answer.queued;
    }

    listPlacements(activityId: string | undefined, signal: AbortSignal): Promise<Placement[]> {
        const query = activityId ? `?activityId=${encodeURIComponent(activityId)}` : "";
        return this.http.request<Placement[]>(`/lti/placements${query}`, "GET", { signal });
    }

    acknowledgeSharing(placementId: string, signal: AbortSignal): Promise<Placement> {
        return this.http.request<Placement>(
            `/lti/placements/${encodeURIComponent(placementId)}/sharing`, "POST", { signal });
    }

    getRoster(placementId: string, signal: AbortSignal): Promise<RosterView> {
        return this.http.request<RosterView>(
            `/lti/placements/${encodeURIComponent(placementId)}/roster`, "GET", { signal });
    }

    enrolFromRoster(placementId: string, signal: AbortSignal): Promise<RosterEnrolment> {
        return this.http.request<RosterEnrolment>(
            `/lti/placements/${encodeURIComponent(placementId)}/roster/enrol`, "POST", { signal });
    }

    listInvitations(signal: AbortSignal): Promise<RegistrationInvitation[]> {
        return this.http.request<RegistrationInvitation[]>("/lti/registrations", "GET", { signal });
    }

    invite(note: string, signal: AbortSignal): Promise<RegistrationInvitation> {
        return this.http.request<RegistrationInvitation>("/lti/registrations", "POST", {
            signal,
            body: { note },
        });
    }

    revokeInvitation(id: string, signal: AbortSignal): Promise<void> {
        return this.http.request<void>(
            `/lti/registrations/${encodeURIComponent(id)}/revoke`, "POST", { signal });
    }

    openChoosing(code: string, signal: AbortSignal): Promise<DeepLinkChoosing> {
        return this.http.request<DeepLinkChoosing>(
            `/lti/deep-link/${encodeURIComponent(code)}`, "GET", { signal });
    }

    answerChoosing(
        code: string, activityIds: string[], signal: AbortSignal): Promise<DeepLinkAnswer> {
        return this.http.request<DeepLinkAnswer>(
            `/lti/deep-link/${encodeURIComponent(code)}/response`, "POST", {
                signal,
                body: { activityIds },
            });
    }
}
