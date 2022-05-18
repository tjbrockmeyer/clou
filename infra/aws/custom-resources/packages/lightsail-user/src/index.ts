import { readFileSync } from 'fs';
import { customResource, success, getLightsailConnection, Response, SSH } from 'my-utils';
import aws from 'aws-sdk';

const schema = JSON.parse(readFileSync('schema.json', 'utf-8'));
const ssm = new aws.SSM();

interface Props {
    InstanceName: string;
}

interface AccessKey {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
}

interface Data { }

const getAccessKey = async (instanceName: string): Promise<AccessKey | undefined> => {
    const {Parameter: param} = await ssm.getParameter({Name: `/lightsail/${instanceName}/access-key`, WithDecryption: true}).promise();
    if(param === undefined || param.Value === undefined) {
        return undefined;
    }
    return JSON.parse(param.Value);
}

const setCreds = async (ssh: SSH, key: AccessKey): Promise<Response<Data>> => {
    await ssh.exec(`\
aws configure set aws_access_key_id ${key.awsAccessKeyId} --profile main && 
aws configure set aws_secret_access_key ${key.awsSecretAccessKey} --profile main`);
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
        const ssh = await getLightsailConnection(props.InstanceName);
        if (!ssh) {
            console.error('failed to establish lightsail connection');
            return false;
        }
        const output = await ssh.exec(`aws configure get aws_access_key_id --profile main 2>&1`);
        return !output.includes(errText) && output.trim() !== '';
    },
    onCreate: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName) as SSH;
        const accessKey = await getAccessKey(props.InstanceName);
        if(accessKey === undefined) {
            throw new Error('failed to get the access key from ssm');
        }
        await setCreds(ssh, accessKey);
        return success();
    },
    onUpdate: async (props, before) => {
        const ssh = await getLightsailConnection(props.InstanceName) as SSH;
        if (before.InstanceName !== props.InstanceName) {
            const beforeSsh = await getLightsailConnection(before.InstanceName);
            if (beforeSsh) {
                await deleteCreds(beforeSsh);
            }
        }
        const accessKey = await getAccessKey(props.InstanceName);
        if(accessKey === undefined) {
            throw new Error('failed to get the access key from ssm');
        }
        await setCreds(ssh, accessKey)
        return success();
    },
    onDelete: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName) as SSH;
        await deleteCreds(ssh);
        return success();
    },
})