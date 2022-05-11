import { stat, readFile } from "fs/promises";
import { dirname } from "path";
import YAML from "yaml";
import { processConfig } from "..";
import { ParseResult, Command, throwParseError } from "../climb";
import { validateConfig } from "../types/config";

type Options = {
    configFile: string;
    stacks: string[];
};

const handler = async (parsed: ParseResult): Promise<void> => {
    const argv = parsed.argv as Options;
    try {
        await stat(argv.configFile);
    } catch(error) {
        if(error instanceof Error && error.message.includes('no such file or directory')) {
            throwParseError(parsed, `config file does not exist: ${argv.configFile}`);
        }
        throw error;
    }
    const config = await validateConfig(YAML.parse(await readFile(argv.configFile, 'utf-8')));
    process.chdir(dirname(argv.configFile));
    await processConfig(config, argv.stacks);
}

export const deploy: Command = {
    name: 'deploy',
    description: 'deploy cloud infrastructure using config files',
    options: [
        {
            name: 'configFile',
            description: 'config file to use',
            alias: 'c',
            args: 'string',
            default: 'infra.yml'
        }
    ],
    args: [
        {
            name: 'stacks',
            description: 'stacks to run - by default, will use the "default" key in the config file',
            array: true,
            default: []
        }
    ],
    handler,
}
