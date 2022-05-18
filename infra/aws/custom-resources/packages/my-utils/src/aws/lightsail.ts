import aws from 'aws-sdk';
import { SSH } from '../helper';

const lightsail = new aws.Lightsail();
const ssm = new aws.SSM();

export const getLightsailConnection = async (instanceName: string): Promise<SSH | undefined> => {
    const {Parameter} = await ssm.getParameter({
        Name: `/lightsail/${instanceName}/private-key`,
        WithDecryption: true,
    }).promise();
    if(!Parameter || !Parameter.Value) {
        return undefined;
    }
    const privateKey = Parameter.Value
    const {instance} = await lightsail.getInstance({instanceName}).promise();
    return instance ? new SSH({
        privateKey,
        host: instance.publicIpAddress,
        username: instance.username,
    }) : undefined;
};