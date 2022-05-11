#!/usr/bin/env node

import { exec } from "../climb";
import { deploy } from "./deploy"; 

exec({
    name: 'clou',
    description: 'deploy to the cloud',
    commands: [
        deploy
    ]
});