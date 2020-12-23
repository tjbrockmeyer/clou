import base64
import json
import subprocess


class AWSError(Exception):
    def __init__(self, e):
        self.process_error = e
        self.cmd = ['"' + a.replace('"', '\\"') + '"' for a in e.cmd]
        self.code = e.returncode
        self.stderr = e.stderr.decode('utf-8')

    def __str__(self):
        return f'The following command returned a code of {self.code}\n{self.cmd}\n{self.stderr}'


def aws(*args):
    try:
        p = subprocess.run(['aws', *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            return json.loads(p.stdout)
        except ValueError:
            print(p.stdout.decode('utf-8'))
            return {}
    except subprocess.CalledProcessError as e:
        raise AWSError(e)


def cloudformation_deploy(filepath, stack_name, capabilities=None, **parameter_overrides):
    args = ['cloudformation', 'deploy', '--template-file', filepath, '--stack-name', stack_name]
    if parameter_overrides:
        args.append('--parameter-overrides')
        for k, v in parameter_overrides.items():
            args.append(f'{k}={v}')
    if capabilities:
        args.append('--capabilities')
        for c in capabilities:
            args.append(c)
    aws(*args)


class LightsailInstance:
    def __init__(self, i):
        self.name = i['name']
        self.arn = i['arn']
        self.availability_zone = i['location']['availabilityZone']
        self.region = i['location']['regionName']
        self.is_static_ip = i['isStaticIp']
        self.public_ip_address = i['publicIpAddress']
        self.username = i['username']
        self.ssh_key_name = i['sshKeyName']


def lightsail_get_instance(instance_name):
    out = aws('lightsail', 'get-instance', '--instance-name', instance_name)
    return LightsailInstance(out['instance'])


class LightsailBundle:
    def __init__(self, b):
        self.price = b['price']
        self.cpu_count = b['cpuCount']
        self.disk_gb = b['diskSizeInGb']
        self.id = b['bundleId']
        self.supported_platforms = b['supportedPlatforms']


def lightsail_get_bundles():
    out = aws('lightsail', 'get-bundles')
    return [LightsailBundle(b) for b in out['bundles']]


def lightsail_import_key_pair(name, public_key):
    b64_key = base64.b64encode(public_key)
    aws('lightsail', 'import-key-pair', '--key-pair-name', name, '--public-key-base64', b64_key)


def lightsail_allocate_static_ip(name):
    aws('lightsail', 'allocate-static-ip', '--static-ip-name', name)


def lightsail_attach_static_ip(instance_name, static_ip_name):
    aws('lightsail', 'attach-static-ip', '--static-ip-name', static_ip_name, '--instance-name', instance_name)


def lightsail_create_instance(name, key_pair_name, user_data,
                              bundle='nano_2_0', availability_zone='us-east-1a', blueprint='amazon_linux_2'):
    aws('lightsail', 'create-instance',
        '--blueprint-id', blueprint,
        '--bundle-id', bundle,
        '--availability-zone', availability_zone,
        '--instance-names', name,
        '--key-pair-name', key_pair_name,
        '--user-data', user_data,
        '--tags', f'key=LightsailInstance,value={name}')


def lightsail_delete_key_pair(name):
    aws('lightsail', 'delete-key-pair', '--key-pair-name', name)


def lightsail_delete_instance(name):
    aws('lightsail', 'delete-instance', '--instance-name', name)


def lightsail_release_static_ip(name):
    aws('lightsail', 'release-static-ip', '--static-ip-name', name)


def iam_create_access_key(user):
    out = aws('iam', 'create-access-keys', '--user-name', user)
    d = out['AccessKeyMetadata'][0]
    return d['AccessKeyId'], d['SecretAccessKey']


def write_ssm_param(name, value, description=None, secret=True, overwrite=True):
    args = ['ssm', 'put-parameter', '--name', name, '--value', value]
    if description is not None:
        args.append('--description')
        args.append(description)
    if overwrite:
        args.append('--overwrite')
    args.append('--type')
    if secret:
        args.append('SecureString')
    else:
        args.append('String')
    aws(*args)


def delete_ssm_params(*names):
    aws('ssm', 'delete-parameters', *names)
