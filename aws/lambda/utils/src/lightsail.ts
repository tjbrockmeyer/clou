import aws from 'aws-sdk';
import SSH2 from 'ssh2-promise';

const lightsail = new aws.Lightsail();

export const getLightsailConnection = async (instanceName: string, privateKey: string) => {
    const {instance} = await lightsail.getInstance({instanceName}).promise();
    return instance ? new SSH2({
        privateKey,
        host: instance.publicIpAddress,
        username: instance.username,
    }) : undefined;
};