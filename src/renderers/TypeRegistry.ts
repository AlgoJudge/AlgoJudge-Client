/**
 * Resolves a renderer from a type discriminator.
 *
 * A type is `name@version`, for example `standard-io@1`. Lookup goes:
 *
 *   1. the exact `name@version`,
 *   2. `name@*`, for a renderer that handles every version of a type,
 *   3. the fallback.
 *
 * The fallback is what keeps the rule that an unknown type must not break the
 * application. `resolve` reports whether it had to use it, so a view can say so
 * rather than pretending it rendered something it did not understand.
 */
export interface Resolved<T> {
    value: T;
    /** False when the fallback was used because nothing matched. */
    supported: boolean;
}

export class TypeRegistry<T> {
    private readonly exact = new Map<string, T>();
    private readonly anyVersion = new Map<string, T>();

    constructor(private readonly fallback: T) {}

    /** `type` is `name@version` or `name@*`. */
    register(type: string, value: T): this {
        const [name, version] = split(type);
        if (version === "*") {
            this.anyVersion.set(name, value);
        } else {
            this.exact.set(type, value);
        }
        return this;
    }

    resolve(type: string | undefined): Resolved<T> {
        if (type) {
            const exact = this.exact.get(type);
            if (exact) return { value: exact, supported: true };

            const [name] = split(type);
            const any = this.anyVersion.get(name);
            if (any) return { value: any, supported: true };
        }
        return { value: this.fallback, supported: false };
    }
}

const split = (type: string): [name: string, version: string] => {
    const at = type.lastIndexOf("@");
    return at === -1 ? [type, ""] : [type.slice(0, at), type.slice(at + 1)];
};

/** The name half of a type, for anything that keys off the kind rather than the version. */
export const typeName = (type: string): string => split(type)[0];
