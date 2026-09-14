/**
 * The one rule both HTTP implementations follow about a multi-valued filter.
 *
 * **An empty selection is not a filter.** A cleared control is somebody asking
 * for everything, and the Server reads a value with no words in it as exactly
 * that — but sending the key empty leans on two halves agreeing about a
 * distinction nobody can see on screen. Not sending it says the same thing and
 * cannot be misread.
 *
 * It lives here rather than in either implementation because both need it and a
 * rule about the wire stated twice is a rule that eventually differs.
 */
export function some(values?: readonly string[]): string[] | undefined {
    return values && values.length > 0 ? [...values] : undefined;
}
