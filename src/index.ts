import { awsCache, awsDeployment } from "./providers/aws";
import { subAllExprs } from "./sub";
import { Config } from "./types/config";


export const processConfig = async (config: Config, deployments: string[]): Promise<void> => {
    deployments = deployments.length !== 0 ? deployments
        : config.default === undefined ? []
            : config.default instanceof Array ? config.default
                : [config.default];
    if(deployments.length === 0) {
        throw new Error('no deployments specified');
    }
    const updatedConfig = subAllExprs(config);
    deployments.forEach(logicalName => {
        const oneOrMoreDeploymentConfigs = updatedConfig.deployments[logicalName];
        if (oneOrMoreDeploymentConfigs === undefined) {
            throw new Error(`no stack named '${logicalName}' in config`);
        }
    });
    if (deployments.some(logicalName => {
        const oneOrMoreDeploymentConfigs = updatedConfig.deployments[logicalName];
        return (oneOrMoreDeploymentConfigs instanceof Array ? oneOrMoreDeploymentConfigs : [oneOrMoreDeploymentConfigs]).some(c => c.provider === 'aws');
    })) {
        process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
        await awsCache();
    }
    await Promise.all(deployments.map(async logicalName => {
        const oneOrMoreDeploymentConfigs = updatedConfig.deployments[logicalName];
        const deploymentConfigs = oneOrMoreDeploymentConfigs instanceof Array ? oneOrMoreDeploymentConfigs : [oneOrMoreDeploymentConfigs];
        await Promise.all(deploymentConfigs.map(async deploymentConfig => {
            switch (deploymentConfig.provider) {
                case 'aws':
                    await awsDeployment(deploymentConfig, config);
            }
        }));
    }));
}
