/**
 * Reading a ranking document.
 *
 * The document is produced by a Runner and stored by the Server without being
 * parsed, so it reaches the Client as genuinely unknown data. Every field is
 * read through one of these rather than asserted, because a shape that is only
 * assumed is a shape that eventually arrives wrong.
 */

export interface RankingProps {
    /** The ranking document, as stored. Each renderer parses its own shape. */
    ranking: unknown;
    timeZone: string;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

export const asArray = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

export const asString = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;

export const asNumber = (v: unknown): number | undefined =>
    typeof v === "number" ? v : undefined;
