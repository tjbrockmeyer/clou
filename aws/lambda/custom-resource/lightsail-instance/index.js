const SSH2 = require('ssh2-promise');
const {send, SUCCESS, FAILED} = require('cfn-response-promise');
const aws = require('aws-sdk');
const lightsail = new aws.Lightsail();
const jsonschema = require('jsonschema');
const fs = require('fs').promises;

const userData = `#!/bin/bash
sudo yum update -y

# support for docker
sudo yum install -y jq
sudo amazon-linux-extras install docker
sudo service docker start
sudo usermod -a -G docker ec2-user

# support for certbot
sudo wget -r --no-parent -A 'epel-release-*.rpm' https://dl.fedoraproject.org/pub/epel/7/x86_64/Packages/e/
sudo rpm -Uvh dl.fedoraproject.org/pub/epel/7/x86_64/Packages/e/epel-release-*.rpm
sudo yum-config-manager --enable epel*
sudo yum repolist all
sudo amazon-linux-extras install epel -y
sudo yum install -y certbot`

const getSshConfig = async (instanceName, privateKey) => {
    const {instance} = await lightsail.getInstance({instanceName}).promise();
    console.log(instance);
    return {
        privateKey,
        host: instance.publicIpAddress,
        username: instance.username,
    };
};

const waitWhilePending = async (instanceName) => {
    while(true) {
        try {
            const output = await lightsail.getInstanceState({instanceName}).promise();
            console.log(output);
            if(output.state.name !== 'pending') {
                return;
            }
            await new Promise(r => setTimeout(r, 1000));
        } catch(error) {
            if(error.message.includes('does not exist')) {
                return;
            }
            throw error;
        }
    }
}

const createInstance = async (instanceName, keyPairName, privateKey, availabilityZone, blueprintId, bundleId, keyId, secretKey) => {
    await lightsail.createInstances({
        instanceNames: [instanceName],
        availabilityZone,
        blueprintId,
        bundleId,
        userData,
        keyPairName,
    }).promise();
    await waitWhilePending(instanceName);
    await new Promise(r => setTimeout(r, 10000)); // wait for ssh to initialize
    const sshConfig = await getSshConfig(instanceName, privateKey);
    const ssh = new SSH2(sshConfig);
    const files = ['as-role', 'composer.py'];
    const executableFiles = (await Promise.all(files.map(async filename => {
        const content = await fs.readFile(filename, 'utf-8');
        return `printf -- '${content}' > bin/${filename} && chmod 744 bin/${filename}`;
    }))).join(' && ');
    await ssh.exec(`\
aws configure set aws_access_key_id '${keyId}' &&
aws configure set aws_secret_access_key '${secretKey}' &&
echo "export LIGHTSAIL_INSTANCE_NAME=${instanceName}" >> .bash_profile &&
echo "export PATH=\\"\\$PATH:/home/${sshConfig.username}/bin\\"" >> .bash_profile &&
mkdir bin && ${executableFiles}`);
}

const deleteInstance = async (instanceName) => {
    try {
        await lightsail.deleteInstance({instanceName}).promise();
        await waitWhilePending(instanceName);
    } catch(error) {
        if(!error.message.includes('does not exist')) {
            throw error;
        }
    }
}

const attachStaticIp = async (instanceName, staticIpName) => {
    await lightsail.attachStaticIp({instanceName, staticIpName}).promise();
}

const detachStaticIp = async (staticIpName) => {
    try {
        await lightsail.detachStaticIp({staticIpName}).promise();
    } catch(error) {
        if(!error.message.includes('is not attached')) {
            throw error;
        }
    }
}

const validateProperties = async (props) => {
    const result = jsonschema.validate(props, {
        type: 'object',
        required: ['ServiceToken', 'InstanceName', 'KeyPairName', 'PrivateKey', 'AvailabilityZone'],
        additionalProperties: false,
        properties: {
            ServiceToken: {},
            InstanceName: {
                type: 'string',
                minLength: 1,
                maxLength: 40,
                pattern: `[a-zA-Z][a-zA-Z0-9_-]*`,
            },
            KeyPairName: {
                type: 'string',
            },
            PrivateKey: {
                type: 'string',
            },
            AvailabilityZone: {
                type: 'string',
            },
            BlueprintId: {
                type: 'string',
                enum: ['amazon_linux_2']
            },
            BundleId: {
                type: 'string',
                enum: ['nano_2_0']
            },
            StaticIpName: {
                type: 'string'
            },
        }
    });
    if(!result.valid) {
        throw new Error(result.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
    }
}

const main = async (event, context) => {
    const {RequestType, ResourceProperties, OldResourceProperties: old} = event;
    const {
        InstanceName,
        KeyPairName,
        PrivateKey,
        StaticIpName,
        AvailabilityZone,
        BlueprintId = 'amazon_linux_2',
        BundleId = 'nano_2_0',
    } = ResourceProperties;

    await validateProperties(ResourceProperties);

    switch(RequestType) {
        case 'Update': {
            const changed = ['InstanceName', 'AvailabilityZone', 'BlueprintId', 'BundleId'].filter(x => old[x] !== ResourceProperties[x]);
            const createNew = changed.length > 0;
            if(createNew) {
                throw new Error(`changing the value of the Property(ies) ${changed.join(', ')} requires creating a new instance, which is not supported`);
            }
            if(createNew) {
                await createInstance(InstanceName, KeyPairName, PrivateKey, AvailabilityZone, BlueprintId, BundleId);
                await deleteInstance(oldName);
            }
            if(!createNew && old.StaticIpName && StaticIpName !== old.StaticIpName) {
                await detachStaticIp(old.StaticIpName);
            }
            if(StaticIpName) {
                await attachStaticIp(InstanceName, StaticIpName);
            }
            break;
        }
        case 'Create': {
            await createInstance(InstanceName, KeyPairName, PrivateKey, AvailabilityZone, BlueprintId, BundleId);
            if(StaticIpName) {
                await attachStaticIp(InstanceName, StaticIpName);
            }
            break;
        }
        case 'Delete': {
            if(StaticIpName) {
                await detachStaticIp(StaticIpName);
            }
            await deleteInstance(InstanceName);
            break;
        }
    }
    await send(event, context, SUCCESS, undefined, InstanceName);
}

exports.handler = async (event, context) => {
    try {
        await main(event, context);
    } catch(error) {
        await send(event, context, FAILED);
        if(Buffer.isBuffer(error)) {
            console.error(error.toString('utf-8'));
        } else {
            console.error(error);
        }
    }
}
