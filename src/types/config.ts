import { readFileSync } from "fs";
import path from "path";
import { projectRoot, typeValidator } from "../utils";

export type Config = {
  version: string;
  name: string;
  vars?: Record<string, unknown>;
  default?: string | string[];
  deployments: Record<string, Deployment | Deployment[]>;
}

export type Deployment = {
  provider: 'aws';
  using: string;
  regions: string | string[];
  preBuild?: string;
  disableRollback?: boolean;
  parameters?: {
    [name: string]: unknown;
  };
}

export const validateConfig = typeValidator<Config>(JSON.parse(readFileSync(path.join(projectRoot, 'schemas/config.json'), 'utf-8')));
