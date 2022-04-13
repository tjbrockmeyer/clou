import { Schema, ValidatorResult, validate } from "jsonschema";

export { Schema } from "jsonschema";

export class Validator<T> {
    private cache: Map<unknown, ValidatorResult>;
    private schema: Schema;

    constructor(schema: Schema) {
        this.cache = new Map();
        this.schema = schema;
    }

    getResult = (instance: unknown): ValidatorResult => {
        if(!this.cache.has(instance)) {
            this.cache.set(instance, validate(instance, this.schema));
        }
        return this.cache.get(instance) as ValidatorResult;
    };

    isValid = (instance: unknown): instance is T => this.getResult(instance).valid;
}
