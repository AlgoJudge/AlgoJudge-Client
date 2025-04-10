import * as AjEvent from "../Event";

export class EventDispatcher {
    private readonly eventTarget: EventTarget = new EventTarget();
    public addEventListener<T extends string, E>(type: T, listener: (evt: E) => void, signal: AbortSignal): void {
        const eventType = "aj-" + type;
        const callback = (evt: Event): void => {
            if (!(evt instanceof CustomEvent)) {
                throw Error("Invalid event");
            }
            if (evt.type !== eventType) {
                throw Error("Invalid event type");
            }
            listener(evt.detail as E);
        }
        this.eventTarget.addEventListener(eventType, callback, { signal: signal });
    }
    public dispatchEvent<E extends AjEvent.Event<T,V>, T extends string, V>(evt: E): void {
        const eventType = "aj-" + evt.type;
        this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail: evt }));
    }
}
