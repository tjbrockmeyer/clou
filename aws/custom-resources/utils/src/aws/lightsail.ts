import aws from 'aws-sdk';
import SSH2 from 'ssh2-promise';
import { SSH } from '../helper';

const lightsail = new aws.Lightsail();

export const getLightsailConnection = async (instanceName: string, privateKey: string): Promise<SSH | undefined> => {
    const {instance} = await lightsail.getInstance({instanceName}).promise();
    return instance ? new SSH(new SSH2({
        privateKey,
        host: instance.publicIpAddress,
        username: instance.username,
    })) : undefined;
};