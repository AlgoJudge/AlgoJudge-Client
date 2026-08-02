export class SortedList<Item, Id> {
    private items: Item[] = [];
    constructor(private id: (item: Item) => Id, private sortComparator: (a: Item, b: Item) => number, private onUpdate: (items: Item[]) => void, private versionReducer?: (a: Item, b: Item) => Item) {}
    addOrUpdate(items: Item[]): Item[] {
        if (!this.versionReducer) {
            const ids = items.map(item => this.id(item));
            this.items = this.items
                .filter(item => ids.indexOf(this.id(item)) === -1)
                .concat(items)
                .sort(this.sortComparator);
        } else {
            throw new Error("Not implemented");
        }
        this.onUpdate([...this.items]);
        return this.items;
    }
    remove(itemId: Id): Item[] {
        this.items = this.items.filter(item => this.id(item) != itemId);
        this.onUpdate([...this.items]);
        return this.items;
    }
}
