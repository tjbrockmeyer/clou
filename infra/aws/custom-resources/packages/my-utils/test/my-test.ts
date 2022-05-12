import { SSM } from 'aws-sdk';
import { getLightsailConnection } from '../src';


(async () => {
    const ssm = new SSM();
    const { Parameter: privateKey } = await ssm.getParameter({ Name: '/lightsail/LS1/private-key', WithDecryption: true }).promise();
    if(!privateKey || !privateKey.Value) {
        throw new Error('missing parameter from ssm');
    }

    const ssh = await getLightsailConnection('LS1');
    if(!ssh) {
        throw new Error('failed to connect');
    }

    console.log(await ssh.exec('ls'));
})().catch(console.error);
