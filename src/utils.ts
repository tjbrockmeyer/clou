import { spawn } from 'child_process';
import { Schema, validate } from 'jsonschema';
import path from 'path';

export const spawnAsync = async (command: string, args?: ReadonlyArray<string>) => {
    const operation = spawn(command, args)
    operation.stdout.on('data', data => process.stdout.write(data.toString()));
    operation.stderr.on('data', data => process.stderr.write(data.toString()));
    return new Promise<void>((resolve, reject) => {
        operation.on('exit', (code) => {
            if(code) {
                reject(new Error(`child process exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });
}

export const mapObjectValues = <TOld, TNew>(o: Record<string, TOld>, mapper: (value: TOld, key: string) => TNew): Record<string, TNew> => {
    return Object.assign({}, ...Object.keys(o).map(k => ({ [k]: mapper(o[k], k) })));
}

export const mapObjectValuesAsync = async <TOld, TNew>(o: Record<string, TOld>, mapper: (value: TOld, key: string) => Promise<TNew>): Promise<Record<string, TNew>> => {
    return Object.assign({}, ...await Promise.all(Object.keys(o).map(async k => ({ [k]: await mapper(o[k], k) }))));
}

export const mapObjectKeys = <T>(o: Record<string, T>, mapper: (key: string, value: T) => string): Record<string, T> => {
    return Object.assign({}, ...Object.keys(o).map(k => ({ [mapper(k, o[k])]: o[k] })));
}

export const mapObjectKeysAsync = async <T>(o: Record<string, T>, mapper: (key: string, value: T) => Promise<string>): Promise<Record<string, T>> => {
    return Object.assign({}, ...Object.keys(o).map(async k => ({ [await mapper(k, o[k])]: o[k] })));
}

export const objectFromKeys = <T>(keys: string[], mapper: (key: string) => T): Record<string, T> => {
    return Object.assign({}, ...keys.map(k => ({ [k]: mapper(k) })));
}

export const objectFromKeysAsync = async <T>(keys: string[], mapper: (key: string) => Promise<T>): Promise<Record<string, T>> => {
    return Object.assign({}, ...await Promise.all(keys.map(async k => ({ [k]: await mapper(k) }))));
}

export const typeValidator = <T extends Record<string, unknown>>(schema: Schema) => {
    return (o: Record<string, unknown>) => {
        const result = validate(o, schema);
        if (!result.valid) {
            throw new Error(result.toString());
        }
        return o as T;
    }
}

export const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
export const isArray = (x: unknown): x is unknown[] => x instanceof Array;
export const isString = (x: unknown): x is string => typeof x === 'string';
