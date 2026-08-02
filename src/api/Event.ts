export interface Event<Type extends string, Value> {
    type: Type;
    data: Value;
}
