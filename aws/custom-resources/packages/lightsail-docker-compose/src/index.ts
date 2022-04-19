import { readFileSync } from 'fs';
import { customResource, success, getLightsailConnection, SSH } from 'my-utils';

const schema = JSON.parse(readFileSync('schema.json', 'utf-8'));
const getFilepath = (dirname: string) => `${getDirPath(dirname)}/docker-compose.yml`;
const getDirPath = (dirname: string) => `~/lightsail-docker-compose/${dirname}`;

interface Props {
    InstanceName: string;
    PrivateKey: string;
    ComposeFile: string;
    RoleArn: string;
}

interface Data {}

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
    await ssh.exec(`
mkdir ${getDirPath(dirname)} &&
echo '${composeFile.replace(/'/g, "'\\''")}' > ${getFilepath(dirname)} &&
cd ${getDirPath(dirname)} &&
docker compose up`);
}

const composeDown = async (ssh: SSH, dirname: string) => {
    await ssh.exec(`cd ${getDirPath(dirname)} && docker compose down`);
}

const deleteDir = async (ssh: SSH, dirname: string) => {
    await ssh.exec(`rm -rf ${getDirPath(dirname)} || echo 'already deleted'`);
}

export const handler = customResource<Props, Data>({
    schema,
    resourceExists: async (props, physicalId) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
        if(!ssh) {
            return false;
        }
        const output = await ssh.exec(`[[ -f ${getFilepath(physicalId)} ]] && echo 'exists' || echo 'missing'`);
        return output === 'exists';
    },
    onCreate: async (props, physicalId) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await assumeRole(ssh, props.RoleArn, props.InstanceName);
        await putCredentials(ssh, props.InstanceName, props.RoleArn, physicalId);
        await composeUp(ssh, props.ComposeFile, physicalId);
        return success();
    },
    onUpdate: async (props, before, physicalId) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await assumeRole(ssh, props.RoleArn, props.InstanceName);
        if(before.InstanceName !== props.InstanceName) {
            const beforeSsh = await getLightsailConnection(before.InstanceName, before.PrivateKey);
            if(beforeSsh) {
                await deleteCredentials(beforeSsh, physicalId);
                await composeDown(beforeSsh, physicalId);
                await deleteDir(beforeSsh, physicalId);
            }
        }
        await putCredentials(ssh, props.InstanceName, props.RoleArn, physicalId);
        await composeUp(ssh, props.ComposeFile, physicalId);
        return success();
    },
    onDelete: async (props, physicalId) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await deleteCredentials(ssh, physicalId);
        await composeDown(ssh, physicalId);
        await deleteDir(ssh, physicalId);
        return success();
    },
})