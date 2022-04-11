import aws from 'aws-sdk'
import path from 'path';
import { readFileSync } from 'fs';
import { cfnLambda, success, getLightsailConnection, failure, Response } from 'my-utils';

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
    if(!ssh) {
        return failure(`could not establish a connection to the lightsail instance '${props.InstanceName}'`);
    }
    await ssh.exec(`\
aws configure set aws_access_key_id ${props.AccessKeyId} --profile main && 
aws configure set aws_secret_access_key ${props.SecretAccessKey} --profile main`);
    return success();
}

export const handler = cfnLambda<Props, Data>({
    schema,
    onCreate: setCreds,
    onUpdate: setCreds,
    onDelete: async (props) => {
        const ssh = await getLightsailConnection(props.InstanceName, props.PrivateKey);
        if(!ssh) {
            console.error(`could not establish a connection to the lightsail instance '${props.InstanceName}'`);
            return success();
        }
        await ssh.exec(`\
aws configure set aws_access_key_id '' --profile main &&
aws configure set aws_secret_access_key '' --profile main`);
        return success();
    },
})