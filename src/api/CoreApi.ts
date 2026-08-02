import { Event } from "./Event";

export interface User {
    username: string,
    name: string,
    email: string,
}

export type CoreEventType = "systemMessage";
export type CoreEvent<T extends CoreEventType, V> = Event<T, V>;

export type SystemMessageEvent = Event<"systemMessage", {
    message: string,
    type: "success" | "info" | "warning" | "error",
}>;

export interface CoreEventDispatcher {
    addEventListener(type: "systemMessage", listener: (evt: SystemMessageEvent) => void, signal: AbortSignal): void;
    addEventListener<T extends CoreEventType, V>(type: T, listener: (evt: CoreEvent<T, V>) => void, signal: AbortSignal): void;
}

export interface CoreApi {
    readonly eventDispatcher: CoreEventDispatcher;
    login(email: string, password: string, signal: AbortSignal): Promise<void>;
    register(email: string, password: string, signal: AbortSignal): Promise<void>;
    getUser(): User | undefined;
}
