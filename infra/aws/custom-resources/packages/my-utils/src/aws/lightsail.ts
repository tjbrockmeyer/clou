import aws from 'aws-sdk';
import SSH2 from 'ssh2-promise';
import { SSH } from '../helper';

const lightsail = new aws.Lightsail();
const ssm = new aws.SSM();

export const getLightsailConnection = async (instanceName: string, privateKey?: string): Promise<SSH | undefined> => {
    if(!privateKey) {
        const {Parameter} = await ssm.getParameter({
            Name: `/lightsail/${instanceName}/private-key`,
            WithDecryption: true,
        }).promise();
        if(!Parameter || !Parameter.Value) {
            return undefined;
        }
        privateKey = Parameter.Value
    }
    const {instance} = await lightsail.getInstance({instanceName}).promise();
    return instance ? new SSH(new SSH2({
        privateKey,
        host: instance.publicIpAddress,
        username: instance.username,
    })) : undefined;
};