import { readFileSync } from 'fs';
import { customResource, success, getLightsailConnection, Response, SSH } from 'my-utils';

const schema = JSON.parse(readFileSync('schema.json', 'utf-8'));

interface Props {
    InstanceName: string;
    PrivateKey: string;
    AccessKeyId: string;
    SecretAccessKey: string;
}

interface Data { }

const setCreds = async (ssh: SSH, props: Props): Promise<Response<Data>> => {
    await ssh.exec(`\
aws configure set aws_access_key_id ${props.AccessKeyId} --profile main && 
aws configure set aws_secret_access_key ${props.SecretAccessKey} --profile main`);
    return success();
}

const deleteCreds = async (ssh: SSH) => {
    await ssh.exec(`\
aws configure set aws_access_key_id '' --profile main &&
aws configure set aws_secret_access_key '' --profile main`);
}

export const handler = customResource<Props, Data>({
    schema,
    getPhysicalId: (props) => props.InstanceName,
    resourceExists: async (props) => {
        const errText = `config profile (main) could not be found`;
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
        if (!ssh) {
            return false;
        }
        try {
            const output = await ssh.exec(`aws configure get aws_access_key_id --profile main &>/dev/stdout | cat /dev/stdin`);
            return !output.includes(errText) && output.trim() !== '';
        } catch (error) {
            if (error instanceof Error && error.message.includes(errText)) {
                return false;
            }
            throw error;
        };
    },
    onCreate: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await setCreds(ssh, props);
        return success();
    },
    onUpdate: async (props, before) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        if (before.InstanceName !== props.InstanceName) {
            const beforeSsh = await getLightsailConnection(before.InstanceName, before.PrivateKey);
            if (beforeSsh) {
                await deleteCreds(beforeSsh);
            }
        }
        await setCreds(ssh, props)
        return success();
    },
    onDelete: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH;
        await deleteCreds(ssh);
        return success();
    },
})