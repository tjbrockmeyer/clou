import { Schema, validate } from 'jsonschema';

export const isValid = <T>(value: unknown, schema: Schema): value is T => {
    return validate(value, schema).valid;
}

export const isValidOrThrow = <T>(value: unknown, schema: Schema): value is T => {
    const result = validate(value, schema);
    if (!result.valid) {
        throw new Error(result.toString());
    }
    return true;
}
