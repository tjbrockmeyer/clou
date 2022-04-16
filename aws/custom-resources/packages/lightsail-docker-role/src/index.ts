import { readFileSync } from 'fs';
import { customResource, success, getLightsailConnection, SSH } from 'my-utils';

const schema = JSON.parse(readFileSync('schema.json', 'utf-8'));

interface Props {
    InstanceName: string;
    PrivateKey: string;
    RoleArn: string;
    ProfileName: string;
}

interface Data { }

interface Creds {
    AccessKeyId: string;
    SecretAccessKey: string;
    SessionToken: string;
    Expiration: string;
}

const assumeRole = async (ssh: SSH, roleArn: string, instanceName: string): Promise<Creds> => {
    try {
        return JSON.parse(await ssh.exec(`aws sts assume-role --role-arn=${roleArn} --role-session-name=Lightsail${instanceName}DockerTask --profile=main`)).Credentials;
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

export const handler = customResource<Props, Data>({
    schema,
    resourceExists: async (props) => {
        const errText = `config profile (${props.ProfileName}) could not be found`;
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
        if(!ssh) {
            return false;
        }
        try {
            const output = await ssh.exec(`aws configure get role_arn --profile=${props.ProfileName} &>/dev/stdout | cat /dev/stdin`);
            return !output.includes(errText) && output.trim() !== '';
        } catch(error) {
            if(error instanceof Error && error.message.includes(errText)) {
                return false;
            }
            throw error;
        }
    },
    onCreate: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await assumeRole(ssh, props.RoleArn, props.InstanceName);
        await putCredentials(ssh, props.InstanceName, props.RoleArn, props.ProfileName);
        return success();
    },
    onUpdate: async (props, before) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await assumeRole(ssh, props.RoleArn, props.InstanceName);

        if(props.InstanceName !== before.InstanceName) {
            const beforeSsh = await getLightsailConnection(before.InstanceName, before.PrivateKey) as SSH;
            if(beforeSsh) {
                await deleteCredentials(beforeSsh, before.ProfileName);
            }
        } else if(props.ProfileName !== before.ProfileName) {
            await deleteCredentials(ssh, before.ProfileName);
        }
        await putCredentials(ssh, props.InstanceName, props.RoleArn, props.ProfileName);
        return success();
    },
    onDelete: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await deleteCredentials(ssh, props.ProfileName);
        return success();
    },
})