import { readFileSync } from "fs";
import path from "path";
import { typeValidator } from "../utils";

type TemplateSubstitution = {
    /** jmespath spec to an object or array */
    Path: string;
    /** key name or index number */
    At: string | number;
}

export type Template = {
    [k: string]: unknown;
    Parameters?: {
        [name: string]: unknown;
    };
    Metadata?: {
        Substitution?: {
            [name: string]: TemplateSubstitution;
        };
    };
}

export const validateTemplate = typeValidator<Template>(JSON.parse(readFileSync(path.join(__dirname, '../../schemas/template.json'), 'utf-8')));
