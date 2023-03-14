import { readFileSync } from "fs";
import path from "path";
import { typeValidator } from "../utils";

export type Config = {
  version: string;
  name: string;
  vars?: Record<string, unknown>;
  default?: string | string[];
  deployments: Record<string, Deployment>;
}

export type Deployment = AWSDeployment;

export type AWSDeployment = {
  provider: 'aws';
  regions: string | string[];
  preBuild?: string;
  disableRollback?: boolean;
  specs: {
    [name: string]: {
      using: string;
      parameters?: {
        [name: string]: unknown;
      };
    };
  };
};

export const validateConfig = typeValidator<Config>(JSON.parse(readFileSync(path.join(__dirname, '../../schemas/config.json'), 'utf-8')));
