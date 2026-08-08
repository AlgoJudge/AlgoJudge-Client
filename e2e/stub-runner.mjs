// A Runner with no sandbox.
//
// The handshake, the claim and the report are the whole Server-facing contract,
// and none of it needs to run code — which is the point: the end-to-end path is
// about a submission reaching a verdict and a screen, not about judging.
//
// Mirrors `AlgoJudge-Server/AlgoJudge.Server.Tests/Build.cs`'s `StubRunner`. Node
// has Ed25519 natively, so no library is needed for the signing.
import { generateKeyPairSync, sign } from "node:crypto";

export class StubRunner {
    #api;
    #keys;
    #token;

    constructor(api) {
        this.#api = api.replace(/\/+$/, "");
        this.#keys = generateKeyPairSync("ed25519");
        this.id = undefined;
        this.fingerprint = undefined;
    }

    /** The raw 32 bytes the Server stores, base64 — not the SPKI wrapper. */
    get publicKey() {
        const { x } = this.#keys.publicKey.export({ format: "jwk" });
        return Buffer.from(x, "base64url").toString("base64");
    }

    async #post(path, body, { token = true } = {}) {
        const headers = { "content-type": "application/json" };
        if (token && this.#token) headers.authorization = `Bearer ${this.#token}`;
        const response = await fetch(`${this.#api}${path}`, {
            method: "POST", headers, body: JSON.stringify(body),
        });
        if (response.status === 204) return undefined;
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`POST ${path} → ${response.status}: ${text.slice(0, 300)}`);
        }
        return text ? JSON.parse(text) : undefined;
    }

    /** Anonymous: a Runner announces itself before anybody has approved it. */
    async register(name = "e2e-stub") {
        const registered = await this.#post("/runner/register", {
            name,
            product: "AlgoJudge-Runner-Stub",
            version: "0.0.1",
            publicKey: this.publicKey,
            problemTypes: ["standard-io@1"],
        }, { token: false });
        this.id = registered.runnerId;
        this.fingerprint = registered.fingerprint;
        return registered;
    }

    /**
     * Proves it holds the key the fingerprint names.
     *
     * The nonce is single-use and short-lived, so this is done once the manager
     * has approved — an unapproved Runner is refused a token, which is the whole
     * of what approval means.
     */
    async authenticate() {
        const { nonce } = await this.#post("/runner/auth/challenge",
            { fingerprint: this.fingerprint }, { token: false });

        const signature = sign(null, Buffer.from(nonce, "utf8"), this.#keys.privateKey)
            .toString("base64");

        const { token } = await this.#post("/runner/auth/token",
            { fingerprint: this.fingerprint, nonce, signature }, { token: false });
        this.#token = token;
        return token;
    }

    /**
     * Claims until this submission's job comes up.
     *
     * The queue is shared, and a Runner takes whatever is oldest — claiming past
     * other people's work is what a real one does.
     */
    async claimFor(submissionId, tries = 60) {
        for (let attempt = 0; attempt < tries; attempt++) {
            const job = await this.#post("/runner/jobs/claim", { leaseSeconds: 300 });
            if (!job) return undefined;
            if (job.submissionId === submissionId) return job;
        }
        return undefined;
    }

    report(job, { score = 100, maxScore = 100, verdict = "Accepted" } = {}) {
        return this.#post(`/runner/jobs/${job.jobId}/report`, {
            leaseToken: job.leaseToken, score, maxScore, verdict, runnerVersion: "0.0.1",
        });
    }
}
