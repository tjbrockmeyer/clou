import { Schema, validate as validateSchema, ValidatorResult } from 'jsonschema';

export const isValid = <T = unknown>(value: unknown, schema: Schema): value is T => {
    return validateSchema(value, schema).valid;
}

export const validate = (value: unknown, schema: Schema): ValidatorResult => {
    return validateSchema(value, schema);
}
