import { subInTemplate } from "../sub";
import { Config, Deployment } from "../types/config";
import aws from 'aws-sdk';
import path from "path";
import YAML, { Scalar, ScalarTag, stringify } from 'yaml';
import { readFile, writeFile } from "fs/promises";
import { randomInt } from "crypto";
import { validateTemplate } from "../types/template";
import { objectFromKeys, projectRoot, spawnAsync } from "../utils";
import { unlink, rm } from "fs/promises";

const customTags: ScalarTag[] = [
    {
        tag: '!Ref',
        resolve: v => ({ Ref: v }),
        stringify: (item) => stringify(item.value),
        default: false,
    },
    ...[
        'And',
        'If',
        'Not',
        'Equals',
        'Or',
        'FindInMap',
        'Base64',
        'Join',
        'Cidr',
        'Sub',
        'GetAtt',
        'GetAZs',
        'ImportValue',
        'Select',
        'Split',
    ].map(tagName => ({
        tag: `!${tagName}`,
        resolve: (v: string) => ({ [`Fn::${tagName}`]: v }),
        stringify: (item: Scalar<unknown>) => stringify(item.value),
        default: false,
    })),
];

type AWSCache = {
    stackNotificationsTopicArn?: string;
    s3BucketName: string;
}

const templateDir = path.join(projectRoot, 'infra/aws/templates');
let _awsCache: AWSCache;

const paramsMapToCmdParams = (paramsMap: Record<string, unknown>): string[] => {
    return Object.keys(paramsMap).length ? ['--parameter-overrides', ...Object.keys(paramsMap).map(p => `${p}=${paramsMap[p]}`)] : [];
}

const buildDeployable = async (template: string, buildDir: string, region: string, paramsMap: Record<string, unknown>) => {
    const samCmd = process.env.OS?.startsWith('Windows') ? 'sam.cmd' : 'sam';
    const paramsInput = paramsMapToCmdParams(paramsMap);
    await spawnAsync(samCmd, ['build', '--template', template, '--build-dir', buildDir, '--region', region, ...paramsInput]);
}

const deployStack = async (template: string, stackName: string, region: string, s3Bucket: string, paramsMap: Record<string, unknown>, notificationsTopic: string | undefined, disableRollback: boolean | undefined) => {
    const samCmd = process.env.OS?.startsWith('Windows') ? 'sam.cmd' : 'sam';
    const rollbackInput = disableRollback ? '--disable-rollback' : '--no-disable-rollback';
    const notificationsInput = notificationsTopic !== undefined ? ['--notification-arns', notificationsTopic] : [];
    const paramsInput = paramsMapToCmdParams(paramsMap);
    await spawnAsync(samCmd, [
        'deploy', '--stack-name', stackName, '--region', region, '--template', template,
        '--capabilities', 'CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND',
        '--no-confirm-changeset', '--s3-bucket', s3Bucket, '--s3-prefix', `code/sam-artifacts/${stackName}`,
        rollbackInput, ...notificationsInput, ...paramsInput
    ]);
}

export const awsCache = async (): Promise<AWSCache> => {
    if (!_awsCache) {
        const ssm = new aws.SSM();
        const { Parameter: topicParam } = await ssm.getParameter({ Name: '/global/stack-notifications-topic-arn' }).promise();
        const { Parameter: s3BucketParam } = await ssm.getParameter({ Name: '/global/bucket-name' }).promise();
        if (s3BucketParam?.Value === undefined) {
            throw new Error('missing S3 bucket - make sure to create the main stack; the bucket should be in the parameter store under /global/bucket-name')
        }
        _awsCache = {
            stackNotificationsTopicArn: topicParam?.Value,
            s3BucketName: s3BucketParam.Value,
        };
    }
    return _awsCache;
}

export const awsDeployment = async (deploymentConfig: Deployment, config: Config) => {
    const cache = await awsCache();
    if (deploymentConfig.preBuild !== undefined) {
        await spawnAsync('bash', ['-c', deploymentConfig.preBuild]);
    }
    const stackName = `${deploymentConfig.using}-${config.name}`;
    const regions = typeof deploymentConfig.regions === 'string' ? [deploymentConfig.regions] : deploymentConfig.regions;
    await Promise.all(regions.map(async (region) => {
        const tempTemplate = `.tmp-infra-${randomInt(65565)}`;
        const buildDir = `.aws-sam/build-${stackName}-${region}`;
        const finalTemplate = `${buildDir}/template.yaml`;
        try {
            const template = validateTemplate(YAML.parse(await readFile(path.join(templateDir, `${deploymentConfig.using}.yml`), 'utf-8'), { customTags }));
            const subbedTemplate = subInTemplate(template, deploymentConfig);
            await writeFile(tempTemplate, YAML.stringify(subbedTemplate, { customTags }));
            const validParams = new Set(Object.keys(template.Parameters || {}));
            const params = Object.keys(deploymentConfig.parameters || {}).filter(k => validParams.has(k));
            const paramsMap = objectFromKeys(params, (k) => (deploymentConfig.parameters as Record<string, unknown>)[k]);
            await buildDeployable(tempTemplate, buildDir, region, paramsMap);
            await deployStack(finalTemplate, stackName, region, cache.s3BucketName, paramsMap, cache.stackNotificationsTopicArn, deploymentConfig.disableRollback);
        } finally {
            Promise.all([
                rm(tempTemplate),
                rm('.aws-sam', { recursive: true, force: true }),
            ]).catch(() => { });
        }
    }));
}