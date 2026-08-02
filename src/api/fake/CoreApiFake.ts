import { CoreApi, User } from "../CoreApi";
import { CoreEventDispatcherImpl } from "../impl/CoreEventDispatcherImpl";

export class CoreApiFake implements CoreApi {
    readonly eventDispatcher: CoreEventDispatcherImpl = new CoreEventDispatcherImpl();
    login(_email: string, _password: string, signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        throw new Error("Method not implemented.");
    }
    register(_email: string, _password: string, signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        throw new Error("Method not implemented.");
    }
    getUser(): User | undefined {
        return {
            username: "john",
            name: "John Smith",
            email: ""
        }
    }
}
