import { readFileSync } from 'fs';
import { cfnLambda, success, getLightsailConnection, Response } from 'my-utils';
import SSH2 from 'ssh2-promise'

const schema = JSON.parse(readFileSync('schema.json', 'utf-8'));

interface Props {
    InstanceName: string;
    PrivateKey: string;
    AccessKeyId: string;
    SecretAccessKey: string;
}

interface Data {}

const safeExec = async (ssh: SSH2, cmd: string): Promise<string> => {
    try {
        return await ssh.exec(cmd);
    } catch(error) {
        if(error instanceof Buffer) {
            throw new Error(`command \`${cmd}\` encountered an error: \n${error.toString('utf-8')}`)
        }
        throw error;
    }
}

const setCreds = async (ssh: SSH2, props: Props): Promise<Response<Data>> => {
    await safeExec(ssh, `\
aws configure set aws_access_key_id ${props.AccessKeyId} --profile main && 
aws configure set aws_secret_access_key ${props.SecretAccessKey} --profile main`);
    return success();
}

const deleteCreds = async (ssh: SSH2) => {
    await safeExec(ssh, `\
aws configure set aws_access_key_id '' --profile main &&
aws configure set aws_secret_access_key '' --profile main`);
}

export const handler = cfnLambda<Props, Data>({
    schema,
    resourceExists: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
        if(!ssh) {
            return false;
        }
        try {
            const output = await safeExec(ssh, `aws configure get aws_access_key_id --profile main &>/dev/stdout | cat /dev/stdin`)
            return !output.includes('config profile (main) could not be found') && output.trim() !== '';
        } catch(error) {
            if(error instanceof Error && error.message.includes('config profile (main) could not be found')) {
                return false;
            }
            throw error;
        };
    },
    onCreate: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH2;
        await setCreds(ssh, props);
        return success();
    },
    onUpdate: async (props, before) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH2;
        if(before.InstanceName !== props.InstanceName) {
            const beforeSsh = await getLightsailConnection(before.InstanceName, before.PrivateKey);
            if(beforeSsh) {
                await deleteCreds(beforeSsh);
            }
        }
        await setCreds(ssh, props)
        return success();
    },
    onDelete: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey) as SSH2;
        await deleteCreds(ssh);
        return success();
    },
})