const SSH2 = require('ssh2-promise');
const {send: cfnSend, SUCCESS, FAILED} = require('cfn-response-promise');
const aws = require('aws-sdk');
const ssm = new aws.SSM();
const lightsail = new aws.Lightsail();

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

const extractJoinCommand = (joinTokenStdOut) => {
    return joinTokenStdOut.split('\n').filter(Boolean).slice(1).join('\n');
}

const getWorkerJoinCmd = async (managerSshConfig) => {
    const ssh = new SSH2(managerSshConfig);
    return extractJoinCommand(await ssh.exec(`docker swarm join-token worker`));
};

const getManagerJoinCmd = async (managerSshConfig) => {
    const ssh = new SSH2(managerSshConfig);
    return extractJoinCommand(await ssh.exec(`docker swarm join-token manager`));
};

const initManager = async (sshConfig, joinCmd = undefined) => {
    const ssh = new SSH2(sshConfig);
    const data = joinCmd
        ? await ssh.exec(`docker swarm init && ${joinCmd}`)
        : await ssh.exec(`docker swarm init && docker service create --name registry --publish published=5000,target=5000 registry:2`);
    console.info('init manager ssh output:\n', data);
};

const initWorker = async (sshConfig, joinCmd) => {
    const ssh = new SSH2(sshConfig);
    const data = await ssh.exec(`docker swarm init && ${joinCmd}`);
    console.info('init worker ssh output:\n', data);
};

const shutdownManager = async (sshConfig) => {
    const ssh = new SSH2(sshConfig);
    const data = await ssh.exec(`docker service rm registry && docker swarm leave --force`);
    console.info('shutdown manager ssh output:\n', data);
};

const shutdownWorker = async (sshConfig) => {
    const ssh = new SSH2(sshConfig);
    const data = await ssh.exec(`docker swarm leave`);
    console.info('shutdown worker ssh output:\n', data);
};

const getManagerDiscovery = async (swarmName) => {
    await ssm.getParameter({
        Name: `/docker-swarm/${swarmName}/manager`,
    }).promise();
}

const putManagerDiscovery = async (swarmName, managerInstanceName) => {
    await ssm.putParameter({
        Name: `/docker-swarm/${swarmName}/manager`,
        Description: `Manager discovery for the ${swarmName} lightsail docker swarm`,
        Value: managerInstanceName,
        Type: 'String',
        Overwrite: true,
    }).promise();
}

const deleteManagerDiscovery = async (swarmName) => {
    try {
        await ssm.deleteParameter({
            Name: `/docker-swarm/${swarmName}/manager`,
        }).promise();
    } catch(error) {
        if(error.code !== 'ParameterNotFound') {
            throw error;
        }
    }
}

const swarmNameRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

const validateProperties = async ({SwarmName, ManagerInstanceNames, WorkerInstanceNames}) => {
    if(!SwarmName || typeof SwarmName !== 'string' || !swarmNameRegex.test(SwarmName)) {
        throw new Error(`Property 'SwarmName' is required, and must be a string that satisfies the regular expression /$${swarmNameRegex.source}/`);
    }
    await getManagerDiscovery()
        .then(() => {
            throw new Error(`a swarm with the name ${SwarmName} already exists`)
        })
        .catch(error => {
            if(error.code !== 'ParameterNotFound') {
                throw error;
            }
        });
    if(!ManagerInstanceNames || !Array.isArray(ManagerInstanceNames) || !ManagerInstanceNames.length) {
        throw new Error(`Property 'ManagerInstanceNames' is required, must be a list, and must have at least one instance name`);
    }
    if(WorkerInstanceNames) {
        if(!Array.isArray(WorkerInstanceNames)) {
            throw new Error(`Property 'WorkerInstanceNames' must be a list`);
        }
        if(ManagerInstanceNames.some(name => WorkerInstanceNames.includes(name))) {
            throw new Error(`Properties 'ManagerInstanceNames' and 'WorkerInstanceNames' cannot share any entries`);
        }
    }
}

const setDifference = (l1, l2) => {
    return (l1 || []).filter(x => !(l2 || []).includes(x));
}

const main = async (event, context) => {
    const {RequestType, ResourceProperties, OldResourceProperties} = event;
    const {
        SwarmName: swarmName,
        ManagerInstanceNames: managers,
        WorkerInstanceNames: workers = [],
    } = ResourceProperties;
    const {
        SwarmName: oldSwarmName,
        ManagerInstanceNames: oldManagers = [],
        WorkerInstanceNames: oldWorkers = [],
    } = OldResourceProperties || {};

    await validateProperties(ResourceProperties);

    const allInstances = Array.from(new Set([...managers, ...workers, ...oldManagers, ...oldWorkers]));
    const allSshConfigs = await getSshConfigs(allInstances);
    const sshConfigs = new Map(allInstances.map((name, i) => [name, allSshConfigs[i]]));

    switch(RequestType) {
        case 'Update': {
            await Promise.all(setDifference(oldWorkers, workers).map(name => shutdownWorker(sshConfigs.get(name))));
            const managerJoinCmd = await getManagerJoinCmd(sshConfigs.get(oldManagers[0]));
            await Promise.all(setDifference(workers, oldWorkers).map(name => initManager(sshConfigs.get(name), managerJoinCmd)));
            await Promise.all(setDifference(oldManagers, managers).map(name => shutdownManager(sshConfigs.get(name))));
            const workerJoinCmd = await getWorkerJoinCmd(sshConfigs.get(managers[0]));
            await Promise.all(setDifference(managers, oldManagers).map(name => initWorker(sshConfigs.get(name), workerJoinCmd)));
            if(swarmName !== oldSwarmName) {
                await deleteManagerDiscovery(oldSwarmName);
            }
            await putManagerDiscovery(swarmName, managers[0]);
            break;
        }
        case 'Create': {
            await Promise.all(managers.map(name => initManager(sshConfigs.get(name))));
            const workerJoinCmd = await getWorkerJoinCmd(sshConfigs.get(managers[0]));
            await Promise.all(workers.map(name => initWorker(sshConfigs.get(name), workerJoinCmd)));
            await putManagerDiscovery(swarmName, managers[0]);
            break;
        }
        case 'Delete': {
            await Promise.all(workers.map(name => shutdownWorker(sshConfigs.get(name))));
            await Promise.all(managers.map(name => shutdownManager(sshConfigs.get(name))));
            await deleteManagerDiscovery();
            break;
        }
    }
    await send(event, context, SUCCESS, undefined, swarmName);
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
