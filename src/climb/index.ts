

export type Cli = {
    name: string;
    description: string;
    commands: (Command | Cli)[];
}

export type Command = {
    name: string;
    description: string;
    options?: Option[];
    args?: Argument[];
    handler: (parsed: ParseResult) => void | Promise<void>;
}

export type Option = {
    name: string;
    alias?: string;
    description?: string;
} & (
        {
            default?: undefined;
            args: 'boolean';
        } | {
            default?: string;
            args: 'string';
        } | {
            default?: string[];
            args: 'array';
        } | {
            default?: Record<string, string>;
            args: Omit<Argument, 'array'>[];
        }
    )

export type Argument = {
    name: string;
    description?: string;
} & (
        {
            default?: string;
            array?: false;
        } | {
            default?: string[];
            array: true;
        }
    )

export type ParsedArgv = Record<string, boolean | string | string[] | Record<string, string>>;

export type ParseResult = {
    valid: boolean;
    argv: ParsedArgv;
    usage: string;
    errors: string[];
    command?: Command;
}

export const throwParseError = ({errors, usage}: ParseResult, error?: string): never => {
    throw new Error(`${usage}\n\n${[...errors, error].filter(Boolean).join('\n')}`);
}

export const exec = async (x: Cli | Command, argv?: string[]) => {
    const result = 'commands' in x ? parseCli(x, argv) : parseCommand(x, argv);
    if(!result.valid) {
        console.error(result.usage);
        process.exit(1);
    }
    try {
        await (result.command as Command).handler(result);
    } catch(error) {
        if(process.env.CLIMB_DEBUG) {
            console.error(error);
        } else {
            console.error(error instanceof Error ? error.message : error);
        }
        process.exit(1);
    }
}

const getCliUsage = (cli: Cli, path: string): string => {
    const commandNameSpacing = Math.max(...cli.commands.map(c => c.name.length));
    return `\
usage:
    ${path}${cli.name} <command>
description:
    ${cli.description}
commands:
    ${cli.commands.map(c => `${c.name}${' '.repeat(commandNameSpacing - c.name.length + 3)}${c.description}`).join('\n    ')}`;
}

const getCommandUsage = (command: Command, path: string): string => {
    const renderOption = (o: Option) => {
        const optName = o.alias !== undefined ? `-${o.alias}` : `--${o.name}`;
        const args = o.args === 'string' ? ` <${o.name}>`
            : o.args === 'array' ? ` <${o.name}...>`
            : o.args === 'boolean' ? ''
            : ` ${o.args.map(a => `<${a.name}>`).join(' ')}`;
        const defaultValue = o.default === undefined ? ''
            : o.args === 'string' ? `="${o.default.replace('"', '\\"')}"`
            : o.args === 'array' ? `=${o.default.map(d => `"${d.replace('"', '\\"')}"`)}`
            : `=${o.args.map(a => `"${(o.default as Exclude<typeof o.default, undefined>)[a.name].replace('"', '\\"')}"`)}`;
        const combined = `${optName}${args}${defaultValue}`;
        return o.default !== undefined ? `[${combined}]` : combined;
    }
    const renderPositional = (p: Argument) => {
        const args = p.array ? `${p.name}...`
            : p.name;
        const defaultValue = p.default === undefined ? ''
            : p.array ? `=${p.default?.map(d => d.replace('"', '\\"'))}`
            : `=${p.default.replace('"', '\\"')}`;
        const combined = `${args}${defaultValue}`;
        return p.default !== undefined ? `[${combined}]` : combined;
    }
    const options = command.options || [];
    const args = command.args || [];
    const booleanShortFlags = options.filter(o => o.args === 'boolean' && o.alias !== undefined).map(o => `-${(o.alias as string).substring(0, 1)}`);
    const booleanLongFlags = options.filter(o => o.args === 'boolean' && o.alias === undefined).map(o => `[--${o.name as string}]`);
    const optsWithDefaults = options.filter(o => o.default !== undefined).map(renderOption);
    const mandatoryOpts = options.filter(o => o.args !== 'boolean' && o.default === undefined).map(renderOption);
    const example = [
        booleanShortFlags.length && `[-${booleanShortFlags.join('')}]`,
        booleanLongFlags.join(' '),
        mandatoryOpts.join(' '),
        optsWithDefaults.join(' '),
        args.map(renderPositional),
    ].filter(Boolean).join(' ');
    const positionalNameSpacing = Math.max(...args.map(p => p.name.length));
    const optionNameSpacing = Math.max(...options.map(o => o.name.length));
    return `\
usage:
    ${path}${command.name} ${example}
description:
    ${command.description}
arguments:
    ${args.map(p => `${p.name}${' '.repeat(positionalNameSpacing - p.name.length + 4)}${p.description}`).join('\n    ')}
options:
    ${options.map(o => `${o.alias ? `-${o.alias} ` : '   '} --${o.name}${' '.repeat(optionNameSpacing - o.name.length + 4)}${o.description}`).join('\n    ')}`;
}

const parseCli = (cli: Cli, argv?: string[], path: string = ''): ParseResult => {
    argv = argv === undefined ? process.argv.slice(2) : argv;
    if(argv.length === 0) {
        return {
            argv: {},
            errors: [`missing command - try one of the following:\n  ${cli.commands.map(c => c.name).join('\n  ')}`],
            usage: getCliUsage(cli, path),
            valid: false,
        };
    }
    const command = argv[0];
    const next = cli.commands.find(c => c.name === command);
    if(next === undefined) {
        return {
            argv: {},
            errors: [`invalid command - '${command}' is not valid, try one of the following:\n  ${cli.commands.map(c => c.name).join('\n  ')}`],
            usage: getCliUsage(cli, path),
            valid: false,
        };
    }
    const newPath = path + `${cli.name} `;
    if('commands' in next) {
        return parseCli(next, argv.slice(1), newPath);
    }
    return parseCommand(next, argv.slice(1), newPath);
}

const parseCommand = (command: Command, argv?: string[], path: string = ''): ParseResult => {
    argv = argv === undefined ? process.argv.slice(2) : argv;
    const errors: string[] = [];
    const out: ParsedArgv = {};
    const options = command.options || [];
    const args = command.args || [];
    options.filter(a => a.default !== undefined).forEach(a => out[a.name as string] = a.default as Exclude<typeof a.default, undefined>);
    args.filter(a => a.default !== undefined).forEach(a => out[a.name as string] = a.default as Exclude<typeof a.default, undefined>);
    const optionMap: Record<string, Option> = Object.assign({}, ...options.map(o => ({ [`--${o.name}`]: o })));
    const aliasMap: Record<string, Option> = Object.assign({}, ...options.filter(o => o.alias !== undefined).map(o => ({ [`-${(o.alias as string).substring(0, 1)}`]: o })));
    let p = 0;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const option = optionMap[arg] || aliasMap[arg];
        const positional = args[p];
        const argList: string[] = [];
        const argObject: Record<string, string> = {};
        if (option) {
            switch (option.args) {
                case 'boolean':
                    out[option.name as string] = true;
                    break;
                case 'string':
                    i++;
                    out[option.name as string] = argv[i];
                    break;
                case 'array':
                    while (!argv[i + 1].startsWith('-')) {
                        i++;
                        argList.push(argv[i]);
                    }
                    out[option.name as string] = argList;
                    break;
                default:
                    for (let j = 0; j < option.args.length; j++) {
                        i++;
                        argObject[option.args[j].name] = argv[i];
                    }
                    out[option.name as string] = argObject;
                    break;
            }
        } else if (arg.startsWith('-')) {
            errors.push(`unknown option: ${arg}`);
        } else if (args.length === p) {
            errors.push(`too many positional arguments: ${arg}`);
        } else if (!positional.array) {
            p++;
            out[positional.name as string] = argv[i];
        } else {
            out[positional.name as string] = argv.slice(i);
            break;
        }
    }
    args.forEach(a => {
        if(a.default === undefined && out[a.name] === undefined) {
            errors.push(`missing required positional argument: ${a.name}`);
        }
    });
    options.forEach(a => {
        if(a.default === undefined && out[a.name] === undefined) {
            errors.push(`missing required option: --${a.name}`);
        }
    });
    const usage = getCommandUsage(command, path);
    return {
        valid: errors.length === 0,
        argv: out,
        errors,
        usage,
        command,
    };
}