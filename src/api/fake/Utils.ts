export class Utils {
    static async sleep(ms: number): Promise<void> {
        if (ms == 0) {
            return;
        }
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    static throwError(message?: string): never {
        throw new Error(message);
    }
}
