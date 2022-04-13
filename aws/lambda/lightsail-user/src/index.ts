import { readFileSync } from 'fs';
import { cfnLambda, success, getLightsailConnection, Response } from 'my-utils';

const schema = JSON.parse(readFileSync('schema.json', 'utf-8'));

interface Props {
    InstanceName: string;
    PrivateKey: string;
    AccessKeyId: string;
    SecretAccessKey: string;
}

interface Data {}

const setCreds = async (props: Props): Promise<Response<Data>> => {
    const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
    await ssh?.exec(`\
aws configure set aws_access_key_id ${props.AccessKeyId} --profile main && 
aws configure set aws_secret_access_key ${props.SecretAccessKey} --profile main`);
    return success();
}

export const handler = cfnLambda<Props, Data>({
    schema,
    resourceExists: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
        return ssh !== undefined && await ssh.exec(`aws configure get aws_access_key_id --profile main`) !== '';
    },
    onCreate: setCreds,
    onUpdate: setCreds,
    onDelete: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
        await ssh?.exec(`\
aws configure set aws_access_key_id '' --profile main &&
aws configure set aws_secret_access_key '' --profile main`);
        return success();
    },
})