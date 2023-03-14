import { readFileSync } from "fs";
import { search } from "jmespath";
import { AWSDeployment, Deployment } from "./types/config";
import { Template } from "./types/template";
import { isArray, isObject, isString, mapObjectValues } from './utils';

const setObjectKeyOrArrayIndex = (input: unknown, expr: string, keyOrIndex: string|number, value: unknown) => {
    const objectOrArray = search(input, expr);
    if(typeof objectOrArray !== 'object' || objectOrArray === null) {
        throw new Error(`expression must point to an object or array - '${expr}' points to '${JSON.stringify(objectOrArray)}'`);
    }
    if(objectOrArray instanceof Array && typeof keyOrIndex !== 'number') {
        throw new Error(`index of array must be a number - cannot set index '${keyOrIndex}' in '${JSON.stringify(objectOrArray)}'`)
    }
    objectOrArray[keyOrIndex] = value;
}

const evaluateExpr = (input: unknown, expr: string): unknown => {
    const value = expr.trim();
    if (value.startsWith('file ')) {
        return readFileSync(value.substring(5), 'utf-8');
    } else if (value.startsWith('ref ')) {
        return search(input, value.substring(4));
    }
    throw new Error(`expression '${expr}' does not evaluate`);
}

const subExprsInString = (input: unknown, str: string): unknown => {
    const openBraces: number[] = [];
    for (let i = 0; i < str.length; i++) {
        if (str.charAt(i) === "{" && str.charAt(i + 1) === "{") {
            openBraces.push(i + 2);
            i++;
        } else if (str.charAt(i) === "}" && str.charAt(i + 1) === "}") {
            const endingIndex = i - 1;
            const startingIndex = openBraces.pop();
            if (!startingIndex) {
                throw new Error("too many closing braces '}}' in string");
            }
            const expr = str.substring(startingIndex, endingIndex);
            const result = evaluateExpr(input, expr);
            if(startingIndex === 0 && i + 2 === str.length) {
                return result;
            }
            const final = typeof result === 'object' && result !== null ? JSON.stringify(result) : String(result);
            str = str.substring(0, startingIndex - 2) + final + str.substring(i + 2);
            i = (startingIndex - 2) + final.length - 1;
        }
    }
    if (openBraces.length) {
        throw new Error("too many opening braces '{{' in string");
    }
    return str;
}

const subAllExprsRecursive = (input: unknown, value: unknown): unknown => {
    if (isString(value)) {
        return subExprsInString(input, value);
    } else if (isArray(value)) {
        return value.map(v => subAllExprsRecursive(input, v));
    } else if (isObject(value)) {
        return mapObjectValues(value, (v => subAllExprsRecursive(input, v)));
    } else {
        return value;
    }
}

export const subAllExprs = <T>(input: T): T => subAllExprsRecursive(input, input) as T;

export const subInTemplate = (template: Template, stack: Deployment['specs']['abc']): Template => {
    const clonedTemplate = JSON.parse(JSON.stringify(template)) as Template;
    const subs = template.Metadata?.Substitution;
    if(subs) {
        Object.keys(subs).forEach(k => {
            const sub = subs[k];
            const value = stack.parameters?.[k];
            if(value !== undefined) {
                setObjectKeyOrArrayIndex(clonedTemplate, sub.Path, sub.At, value);
            }
        });
    }
    return clonedTemplate;
}

//#region tests

export const __tests__ = () => {
    describe('setObjectKeyOrArrayIndex', () => {
        it('should update the input in-place at the path to an object', () => {
            const newValue = 'value - z';
            const key = 'abc123';
            const input = {abc: {'123': [{[key]: 'value - x'}]}};
            const expected = {abc: {'123': [{[key]: newValue}]}};
            const expr = 'abc."123"[0]';
            const inputClone = JSON.parse(JSON.stringify(input));
            setObjectKeyOrArrayIndex(inputClone, expr, key, newValue);
            expect(inputClone).toEqual(expected);
            expect(inputClone).not.toEqual(input);
        });
        it('should update the input in-place at the path to an array', () => {
            const newValue = 'value - z';
            const index = 1;
            const input = {abc: {'123': [{}, 'old value']}};
            const expected = {abc: {'123': [{}, newValue]}};
            const expr = 'abc."123"';
            const inputClone = JSON.parse(JSON.stringify(input));
            setObjectKeyOrArrayIndex(inputClone, expr, index, newValue);
            expect(inputClone).toEqual(expected);
            expect(inputClone).not.toEqual(input);
        });
        it.each([null, 'str', 5])('should throw an error when the expression results in %s', (value) => {
            const key = 'abc123';
            const input = {abc: {'123': [value]}};
            const expr = 'abc."123"[0]';
            expect(setObjectKeyOrArrayIndex.bind(this, input, expr, key, 'any value')).toThrow('expression must point to an object or array');
        });
        it('should throw an error when setting a string index of an array', () => {
            const index = 'this is not a number';
            const input = {abc: {'123': [{}, 'old value']}};
            const expr = 'abc."123"';
            expect(setObjectKeyOrArrayIndex.bind(this, input, expr, index, 'any value')).toThrow('index of array must be a number');
        });
    });


    describe('evaluateExpr', () => {
        it('should get the file contents', () => {
            const input = {};
            const expr = ' file schemas/config.json ';
            const fileContents = readFileSync('schemas/config.json', 'utf-8');
            const result = evaluateExpr(input, expr);
            expect(result).toEqual(fileContents);
        });
        it('should reference the value from the input (number)', () => {
            const value = 999;
            const input = {abc: {abc123: [{}, value]}};
            const expr = ' ref abc.abc123[1] ';
            const result = evaluateExpr(input, expr);
            expect(result).toEqual(value);
        });
        it('should reference the value from the input (object)', () => {
            const value = {key: 'value'};
            const input = {abc: {abc123: [{}, value]}};
            const expr = ' ref abc.abc123[1] ';
            const result = evaluateExpr(input, expr);
            expect(result).toEqual(value);
        });
    });

    describe('subExprsInString', () => {
        it('should replace a number expression in the string', () => {
            const input = {
                vars: {
                    abc: '123',
                    xyz: 'lmnop',
                }
            };
            const str = 'this is a {{ ref vars.abc }} string';
            const expected = 'this is a 123 string';
            const result = subExprsInString(input, str);
            expect(result).toEqual(expected);
        });
        it('should replace and stringify an object expression in the string', () => {
            const input = {
                vars: {
                    abc: {big: {object: {big: {deep: '123'}}}},
                    xyz: 'lmnop',
                }
            };
            const str = 'this is a {{ ref vars.abc }} string';
            const expected = `this is a ${JSON.stringify(input.vars.abc)} string`;
            const result = subExprsInString(input, str);
            expect(result).toEqual(expected);
        });
        it('should replace multiple expressions in a string', () => {
            const input = {
                vars: {
                    value1: 'abc',
                    value2: 123,
                }
            };
            const str = 'this is a {{ ref vars.value1 }} string with {{ ref vars.value2 }} as well';
            const expected = `this is a abc string with 123 as well`;
            const result = subExprsInString(input, str);
            expect(result).toEqual(expected);
        });
        it('should recursively replace even inside another expression', () => {
            const input = {
                vars: {
                    env: 'npr',
                    nprValue: 'abc123',
                    prdValue: 'xyz987',
                }
            };
            const str = 'this is a {{ ref vars.{{ ref vars.env }}Value }} string';
            const expected = `this is a abc123 string`;
            const result = subExprsInString(input, str);
            expect(result).toEqual(expected);
        });
        it('should throw an error when there are no closing braces', () => {
            const input = {};
            const str = 'this is a {{ string';
            expect(subExprsInString.bind(this, input, str)).toThrow('too many opening braces');
        });
        it('should throw an error when there are no opening braces', () => {
            const input = {};
            const str = 'this is a }} string';
            expect(subExprsInString.bind(this, input, str)).toThrow('too many closing braces');
        });
    });

    describe('subAllExprs', () => {
        it('should replace arbitrarily nested strings', () => {
            const input = {
                vars: {
                    value1: 'abc',
                    value2: 'def',
                    value3: 'ghi'
                },
                stacks: {
                    abc: {
                        name: '{{ ref vars.value1 }}',
                        parameters: {
                            MyParameter: '{{ ref vars.value2 }}',
                            MyList: [
                                '{{ ref vars.value3 }}'
                            ]
                        }
                    }
                }
            };
            const expected = {
                vars: {
                    value1: 'abc',
                    value2: 'def',
                    value3: 'ghi'
                },
                stacks: {
                    abc: {
                        name: 'abc',
                        parameters: {
                            MyParameter: 'def',
                            MyList: [
                                'ghi'
                            ]
                        }
                    }
                }
            };
            const result = subAllExprs(input);
            expect(result).toEqual(expected);
            expect(result).not.toEqual(input);
        });
    });

    describe('subInTemplate', () => {
        it('should replace all Metadata.Substitutions with the value from the config', () => {
            const template: Template = {
                Metadata: {
                    Substitution: {
                        Sub1: {
                            Path: 'Resources.MyResource.Properties',
                            At: 'Prop1'
                        },
                        Sub2: {
                            Path: 'Resources.MyResource.Properties.Prop2',
                            At: 'Abc'
                        }
                    }
                },
                Resources: {
                    MyResource: {
                        Type: 'abc',
                        Properties: {
                            Prop1: [],
                            Prop2: {
                                Abc: '123'
                            }
                        }
                    }
                }
            };
            const stack: AWSDeployment = {
                provider: 'aws',
                regions: ['us-east-1'],
                specs: {
                    abc: {
                        using: 'template',
                        parameters: {
                            Sub1: 'abc123',
                            Sub2: 'xyz098',
                        },
                    }
                },
            };
            const expected: Template = {
                Metadata: template.Metadata,
                Resources: {
                    MyResource: {
                        Type: 'abc',
                        Properties: {
                            Prop1: stack.specs.abc.parameters?.Sub1,
                            Prop2: {
                                Abc: stack.specs.abc.parameters?.Sub2,
                            }
                        }
                    }
                }
            };
            const result = subInTemplate(template, stack.specs.abc);
            expect(result).toEqual(expected);
            expect(result).not.toEqual(template);
        });
        it('should not alter the template if there is no Metadata section', () => {
            const template: Template = {
                Resources: {
                    MyResource: {
                        Type: 'abc',
                        Properties: {
                            Prop1: [],
                            Prop2: {
                                Abc: '123'
                            }
                        }
                    }
                }
            };
            const stack: AWSDeployment = {
                provider: 'aws',
                regions: ['us-east-1'],
                specs: {
                    abc: {
                        using: 'template',
                        parameters: {
                            Sub1: 'abc123',
                            Sub2: 'xyz098',
                        },
                    }
                },
            };
            const result = subInTemplate(template, stack.specs.abc);
            expect(result).toEqual(template);
        });
        it('should not alter the template if there is no Metadata.Substitutions section', () => {
            const template: Template = {
                Metadata: {},
                Resources: {
                    MyResource: {
                        Type: 'abc',
                        Properties: {
                            Prop1: [],
                            Prop2: {
                                Abc: '123'
                            }
                        }
                    }
                }
            };
            const stack: AWSDeployment = {
                provider: 'aws',
                regions: ['us-east-1'],
                specs: {
                    abc: {
                        using: 'template',
                        parameters: {
                            Sub1: 'abc123',
                            Sub2: 'xyz098',
                        },
                    }
                },
            };
            const result = subInTemplate(template, stack.specs.abc);
            expect(result).toEqual(template);
        });
        it('should not alter the template if there are no keys in the Metadata.Substitutions section', () => {
            const template: Template = {
                Metadata: {
                    Substitution: {}
                },
                Resources: {
                    MyResource: {
                        Type: 'abc',
                        Properties: {
                            Prop1: [],
                            Prop2: {
                                Abc: '123'
                            }
                        }
                    }
                }
            };
            const stack: AWSDeployment = {
                provider: 'aws',
                regions: ['us-east-1'],
                specs: {
                    abc: {
                        using: 'template',
                        parameters: {
                            Sub1: 'abc123',
                            Sub2: 'xyz098',
                        },
                    }
                },
            };
            const result = subInTemplate(template, stack.specs.abc);
            expect(result).toEqual(template);
        });
        it('should not alter the template if there is no parameters section', () => {
            const template: Template = {
                Metadata: {
                    Substitution: {
                        Sub1: {
                            Path: 'Resources.MyResource.Properties',
                            At: 'Prop1'
                        },
                        Sub2: {
                            Path: 'Resources.MyResource.Properties.Prop2',
                            At: 'Abc'
                        }
                    }
                },
                Resources: {
                    MyResource: {
                        Type: 'abc',
                        Properties: {
                            Prop1: [],
                            Prop2: {
                                Abc: '123'
                            }
                        }
                    }
                }
            };
            const stack: AWSDeployment = {
                provider: 'aws',
                regions: ['us-east-1'],
                specs: {
                    abc: {
                        using: 'template',
                    }
                },
            };
            const result = subInTemplate(template, stack.specs.abc);
            expect(result).toEqual(template);
        });
        it('should not alter the template if there are no matching parameters for the Metadata.Substitutions section', () => {
            const template: Template = {
                Metadata: {
                    Substitution: {
                        Sub1: {
                            Path: 'Resources.MyResource.Properties',
                            At: 'Prop1'
                        },
                        Sub2: {
                            Path: 'Resources.MyResource.Properties.Prop2',
                            At: 'Abc'
                        }
                    }
                },
                Resources: {
                    MyResource: {
                        Type: 'abc',
                        Properties: {
                            Prop1: [],
                            Prop2: {
                                Abc: '123'
                            }
                        }
                    }
                }
            };
            const stack: AWSDeployment = {
                provider: 'aws',
                regions: ['us-east-1'],
                specs: {
                    abc: {
                        using: 'template',
                        parameters: {
                        }
                    }
                }
            };
            const result = subInTemplate(template, stack.specs.abc);
            expect(result).toEqual(template);
        });
    });
}

//#endregion
