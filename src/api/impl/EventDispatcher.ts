export class EventDispatcher<T extends string> {
    private readonly eventTarget: EventTarget = new EventTarget();
    public addEventListener<E>(type: T, listener: (evt: E) => void, signal: AbortSignal): void {
        const eventType = "aj" + type;
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
    public dispatchEvent<E>(type: T, evt: E): void {
        const eventType = "aj" + type;
        this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail: evt }));
    }
}
