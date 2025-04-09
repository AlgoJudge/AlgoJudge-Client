import { Api } from "./Api";
import { FakeApiFactory } from "./fake/FakeApiFactory";

export class ApiFactory {
    public static create(): Api {
        // For development purposes
        return FakeApiFactory.create();
    }
}
