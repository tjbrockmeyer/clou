import { readFileSync } from 'fs';
import { customResource, success, getLightsailConnection, SSH } from 'my-utils';
import * as YAML from 'yaml';

const schema = JSON.parse(readFileSync('schema.json', 'utf-8'));
const getFilepath = (dirname: string) => `${getDirPath(dirname)}/docker-compose.yml`;
const getDirPath = (dirname: string = '') => `~/lightsail-docker-compose/${dirname}`;

interface Props {
    InstanceName: string;
    ComposeFile: string | Record<string, unknown>;
    RoleArn: string;
}

interface Data { }

interface RepoInfo {
    url: string;
    region: string;
}

const getRepoInfo = (composeFileContent: string): RepoInfo => {
    const composeFile = YAML.parse(composeFileContent) as Record<string, unknown>;
    const repoInfos = Object.keys(composeFile.services as Record<string, unknown>).map(k => {
        const service = (composeFile.services as Record<string, unknown>)[k] as Record<string, unknown>;
        const image = service.image as string;
        if (image.includes('.dkr.ecr.') && image.includes('.amazonaws.com')) {
            return {
                url: image.split('/')[0],
                region: image.split('/')[0].split('.')[3]
            };
        }
        return undefined;
    });
    return repoInfos.filter(Boolean)[0] as Exclude<typeof repoInfos[0], undefined>;
}

const coerceFile = (file: string | Record<string, unknown>): string =>
    typeof file === 'string' ? file : JSON.stringify(file);

const auditComposeFile = (contents: string, awsProfile: string, awsRegion: string): string => {
    const awsCredsVolume = '~/.aws:/root/.aws:ro';
    const composeFile = YAML.parse(contents) as Record<string, unknown>;
    Object.keys(composeFile.services as Record<string, unknown>).forEach(name => {
        const service = (composeFile.services as Record<string, unknown>)[name] as Record<string, unknown>;
        if (!service.volumes) {
            service.volumes = [];
        }
        const volumes = service.volumes as (string | {})[];
        if (!volumes.some(v => v === awsCredsVolume)) {
            volumes.push(awsCredsVolume);
        }
        if (!service.environment) {
            service.environment = [];
        }
        const environment = service.environment as Record<string, string> | string[];
        if (environment instanceof Array) {
            environment.push(`AWS_REGION=${awsRegion}`);
            environment.push(`AWS_PROFILE=${awsProfile}`);
        } else {
            environment.AWS_REGION = awsRegion;
            environment.AWS_PROFILE = awsProfile;
        }
    });
    return YAML.stringify(composeFile);
}

const assumeRole = async (ssh: SSH, roleArn: string, instanceName: string): Promise<void> => {
    try {
        await ssh.exec(`aws sts assume-role --role-arn=${roleArn} --role-session-name=Lightsail${instanceName}DockerTask --profile=main`);
    } catch (error) {
        const message = (error as Buffer).toString('utf-8');
        throw new Error(`failed to assume-role from inside the lightsail instance - assure that the role can be assumed by 'arn:aws:iam::*:user/lightsail/${instanceName}': ${message}`);
    }
}

const putCredentials = async (ssh: SSH, instanceName: string, roleArn: string, profileName: string) => {
    await ssh.exec(`
aws configure set role_arn ${roleArn} --profile=${profileName} &&
aws configure set source_profile main --profile=${profileName} &&
aws configure set role_session_name Instance${instanceName}DockerTask --profile=${profileName}`);
}

const deleteCredentials = async (ssh: SSH, profileName: string) => {
    await ssh.exec(`\
aws configure set role_arn '' --profile=${profileName} &&
aws configure set source_profile '' --profile=${profileName} &&
aws configure set role_session_name '' --profile=${profileName}`);
}

const composeUp = async (ssh: SSH, composeFile: string, dirname: string) => {
    const repoInfo = getRepoInfo(composeFile);
    await ssh.exec(`mkdir ${getDirPath()} 2>&1 | cat`);
    await ssh.exec(`mkdir ${getDirPath(dirname)} 2>&1 | cat`);
    console.log(await ssh.exec(`AWS_PROFILE=${dirname} aws sts get-caller-identity 2>&1 | cat`));
    await ssh.exec(`
AWS_PROFILE=${dirname} aws ecr get-login-password --region ${repoInfo.region} | \
    docker login --username AWS --password-stdin ${repoInfo.url} 2>/dev/null &&
echo '${composeFile.replace(/'/g, "'\\''")}' > ${getFilepath(dirname)} &&
cd ${getDirPath(dirname)} &&
docker-compose --log-level ERROR up -d 2>/dev/null`);
}

const composeDown = async (ssh: SSH, dirname: string) => {
    await ssh.exec(`cd ${getDirPath(dirname)} && docker-compose down 2>&1 | cat`);
}

const deleteDir = async (ssh: SSH, dirname: string) => {
    await ssh.exec(`rm -rf ${getDirPath(dirname)} &>/dev/null || echo 'already deleted'`);
}

export const handler = customResource<Props, Data>({
    schema,
    resourceExists: async (props, { physicalId }) => {
        const ssh = await getLightsailConnection(props.InstanceName);
        if (!ssh) {
            return false;
        }
        const output = await ssh.exec(`[[ -f ${getFilepath(physicalId)} ]] && echo 'exists' || echo 'missing'`);
        return output.trim() === 'exists';
    },
    onCreate: async (props, { physicalId, stackRegion }) => {
        const ssh = await getLightsailConnection(props.InstanceName) as SSH;
        await assumeRole(ssh, props.RoleArn, props.InstanceName);
        await putCredentials(ssh, props.InstanceName, props.RoleArn, physicalId);
        await composeUp(ssh, auditComposeFile(coerceFile(props.ComposeFile), props.RoleArn, stackRegion), physicalId);
        return success();
    },
    onUpdate: async (props, before, { physicalId, stackRegion }) => {
        const ssh = await getLightsailConnection(props.InstanceName) as SSH;
        await assumeRole(ssh, props.RoleArn, props.InstanceName);
        if (before.InstanceName !== props.InstanceName) {
            const beforeSsh = await getLightsailConnection(before.InstanceName);
            if (beforeSsh) {
                await deleteCredentials(beforeSsh, physicalId);
                await composeDown(beforeSsh, physicalId);
                await deleteDir(beforeSsh, physicalId);
            }
        }
        await putCredentials(ssh, props.InstanceName, props.RoleArn, physicalId);
        await composeUp(ssh, auditComposeFile(coerceFile(props.ComposeFile), props.RoleArn, stackRegion), physicalId);
        return success();
    },
    onDelete: async (props, { physicalId }) => {
        const ssh = await getLightsailConnection(props.InstanceName) as SSH;
        await deleteCredentials(ssh, physicalId);
        await composeDown(ssh, physicalId);
        await deleteDir(ssh, physicalId);
        return success();
    },
});
