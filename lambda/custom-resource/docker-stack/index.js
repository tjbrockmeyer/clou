const SSH2 = require('ssh2-promise');
const jsonschema = require('jsonschema');
const {send: cfnSend, SUCCESS, FAILED} = require('cfn-response-promise');
const aws = require('aws-sdk');
const ssm = new aws.SSM();
const lightsail = new aws.Lightsail();
const iam = new aws.IAM();

let send = cfnSend;

const getSshConfigs = async (instanceNames) => {
    const paths = instanceNames.map(name => `/lightsail/${name}/private-key`);
    const [
        {instances}, 
        {InvalidParameters, Parameters}
    ] = await Promise.all([
        lightsail.getInstances({}).promise(),
        ssm.getParameters({Names: [...paths], WithDecryption: true}).promise(),
    ]);
    const missingInstances = instanceNames.filter(name => !instances.some(x => x.name === name));
    if(missingInstances.length) {
        throw new Error(`the following lightsail instances do not exist: ${missingInstances.join(', ')}`);
    }
    if(InvalidParameters.length) {
        throw new Error(`the following lightsail instances don't have registered private keys: ${InvalidParameters.join(', ')}`);
    }
    return instanceNames.map((name, i) => {
        const instance = instances.find(x => x.name === name);
        return {
            privateKey: Parameters.find(p => p.Name === paths[i]).Value,
            host: instance.publicIpAddress,
            username: instance.username,
        };
    });
};

const getManagerDiscovery = async (swarmName) => {
    await ssm.getParameter({Name: `/docker-swarm/${swarmName}/manager`}).promise();
}

const getStackRole = async (roleName) => {
    return await iam.getRole({RoleName: roleName}).promise();
}

const writeComposeSettings = async (sshConfig, settings) => {
    const ssh = new SSH2(sshConfig);
    ssh.
}

const validateProperties = (ResourceProperties) => {
    const result = jsonschema.validate(ResourceProperties, require('./schema'));
    if(!result.valid) {
        throw new Error(result.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
    }
    await getManagerDiscovery().catch(error => {
            if(error.message.includes('does not exist')) {
                throw new Error(`A swarm with the name ${SwarmName} does not exist`);
            }
        });
    await getStackRole().catch(error => {
        if(error.message.includes('does not exist')) {
            throw new Error(`A role with the name ${RoleName} does not exist`);
        }
    });
}

const main = async (event, context) => {
    const {RequestType, ResourceProperties, OldResourceProperties: old} = event;
    const {
        StackName,
        SwarmName,
        RoleName,
        Services,
        Secrets,
    } = ResourceProperties;

    validateProperties(ResourceProperties);

    const managerInstance = await getManagerDiscovery(SwarmName);
    const sshConfig = await getSshConfigs([managerInstance]);

    switch(RequestType) {
        case 'Update': {
            
            break;
        }
        case 'Create': {
            
            break;
        }
        case 'Delete': {
            
            break;
        }
    }
    await send(event, context, SUCCESS, undefined, stackName);
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

if(require.main === module) {
    send = (event, ctx, ...args) => console.log('sending:', ...args);
    exports.handler({
        ResourceProperties: {
            SwarmName: 'my-swarm', 
            ManagerInstanceNames: ['LS1']
        },
        RequestType: 'Delete'
    }).then(() => process.exit(0));
}
