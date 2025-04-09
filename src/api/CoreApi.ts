export interface User {
    username: string,
    name: string,
    email: string,
}

export interface SystemMessageEvent {
    message: string,
    type: "success" | "info" | "warning" | "error",
}

export interface CoreEventDispatcher {
    addSystemMessageEventListener(listener: (evt: SystemMessageEvent) => void, signal: AbortSignal): void;
}

export interface CoreApi {
    readonly eventDispatcher: CoreEventDispatcher;
    login(email: string, password: string, signal: AbortSignal): Promise<void>;
    register(email: string, password: string, signal: AbortSignal): Promise<void>;
    getUser(): User | undefined;
}
