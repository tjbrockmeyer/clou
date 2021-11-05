import json
import os
import subprocess
import time
import sys
from datetime import datetime


role_secret_name = 'role_creds'


def _to_yaml(obj):
    if isinstance(obj, list):
        if not len(obj):
            return '[]'
        lines = []
        for item in obj:
            result = _to_yaml(item)
            if isinstance(result, list):
                lines.append(f'- {result[0]}')
                for line in result[1:]:
                    lines.append(f'  {line}')
            else:
                lines.append(f'- {result}')
        return lines
    elif isinstance(obj, dict):
        if not len(obj):
            return '{}'
        lines = []
        for k, v in obj.items():
            result = _to_yaml(v)
            if isinstance(result, list):
                lines.append(f'{k}:')
                for line in result:
                    lines.append(f'  {line}')
            else:
                lines.append(f'{k}: {result}')
        return lines
    elif obj is None:
        return ''
    elif isinstance(obj, int) or isinstance(obj, float):
        return str(obj)
    elif isinstance(obj, str):
        return json.dumps(obj)
    elif isinstance(obj, bool):
        return 'true' if obj else 'false'
    else:
        return obj


def to_yaml(object):
    return '\n'.join(_to_yaml(object))


def iam_get_role(role_name):
    try:
        p = subprocess.run(
            [
                'aws', 'iam', 'get-role', '--role-name', role_name, 
                '--output', 'json', '--query', 'Role'
            ], text=True,  stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return json.loads(p.stdout)
    except subprocess.CalledProcessError as e:
        return {'Error': e.stderr}


def sts_assume_role(role_arn, session_name):
    try:
        p = subprocess.run(
            [
                'aws', 'sts', 'assume-role', '--role-arn', role_arn, '--role-session-name', session_name, 
                '--output', 'json', '--query', 'Credentials'
            ], text=True,  stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return json.loads(p.stdout)
    except subprocess.CalledProcessError as e:
        return {'Error': e.stderr}


def switch_to_role(creds):
    old_id = os.environ.get('AWS_ACCESS_KEY_ID')
    old_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
    old_token = os.environ.get('AWS_SESSION_TOKEN')
    
    def switch_back():
        os.environ['AWS_ACCESS_KEY_ID'] = old_id or ''
        os.environ['AWS_SECRET_ACCESS_KEY'] = old_key or ''
        os.environ['AWS_SESSION_TOKEN'] = old_token or ''

    os.environ['AWS_ACCESS_KEY_ID'] = creds['AccessKeyId']
    os.environ['AWS_SECRET_ACCESS_KEY'] = creds['SecretAccessKey']
    os.environ['AWS_SESSION_TOKEN'] = creds['SessionToken']
    return switch_back


def ssm_get_parameter(**kwargs):
    args = [f'--name={kwargs["Name"]}']
    if kwargs['WithDecryption']:
        args.append('--with-decryption')
    try:
        p = subprocess.run(['aws', 'ssm', 'get-parameter', '--output=text', '--query=Parameter.Value', *args], 
                           text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    except subprocess.CalledProcessError as e:
        if 'ParameterNotFound' in e.stderr:
            return None
        return {'Error': e.stderr}
    return p.stdout


def get_secret_value(source, path, role_arn):
    if source == 'PARAMETER_STORE':
        try:
            p = subprocess.run(
                [
                    'aws', 'ssm', 'get-parameter', 
                    '--name', path, '--with-decryption', '--output=text', '--query=Parameter.Value'
                ], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            print(path, p.stdout, p.stderr)
            return p.stdout
        except subprocess.CalledProcessError as e:
            print('encountered an error while running', e.cmd)
            print('error:', e.stderr)
            sys.exit(1)
    else:
        raise Exception(f'source of {source} is not valid - try PARAMETER_STORE')


def get_secret_full_name(stack_name, name, version):
    return f'{stack_name}_{name}_{version}'


def docker_secret_create(name, value):
    try:
        p = subprocess.run(['docker', 'secret', 'create', name, '-'], 
                           text=True, input=value, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return p.stdout, True
    except subprocess.CalledProcessError as e:
        return e.stderr, False


def docker_secret_rm(*names):
    try:
        p = subprocess.run(['docker', 'secret', 'rm', *names], 
                           text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return p.stdout, True
    except subprocess.CalledProcessError as e:
        return e.stderr, False


def docker_stack_build(compose_file, stack_name):
    try:
        p = subprocess.run(['docker', 'stack', 'deploy', '-c', '-', stack_name], 
                           text=True, input=compose_file, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return p.stdout, True
    except subprocess.CalledProcessError as e:
        return e.stderr, False


def docker_stack_build(compose_file, stack_name):
    try:
        p = subprocess.run(['docker', 'stack', 'deploy', '-c', '-', stack_name], 
                           text=True, input=compose_file, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return p.stdout, True
    except subprocess.CalledProcessError as e:
        return e.stderr, False


def main(settings_file):
    now = time.time()

    with open(settings_file, 'r') as f:
        settings = json.load(f)
    
    swarm_name = settings['SwarmName']
    stack_name = settings['StackName']
    role_name = settings['RoleName']
    services = settings['Services']
    secrets = settings['Secrets']

    metadata = {
        secret['Name']: {
            'isNew': secret.get('_LastVersion') is None,
            'isUpdating': secret.get('_LastVersion') is None or secret['_NextRefresh'] < now,
            'version': secret.get('_LastVersion') or 1,
            'nextVersion': (secret.get('_LastVersion') or 1) % 100 + 1,
        } for secret in secrets
    }
    role = iam_get_role(role_name)
    if 'Error' in role:
        print('error getting role:', role)
        return
    role_is_new = settings.get('_LastRoleVersion') is None
    role_is_updating = role_is_new or settings.get('_NextRoleRefresh') < now
    role_secret_version = settings.get('_LastRoleVersion') or 1
    role_secret_next_version = (settings.get('_LastRoleVersion') or 1) % 100 + 1
    

    print('getting values of secrets to update')
    creds = sts_assume_role(role['Arn'], f'docker-{swarm_name}-{stack_name}')
    switch_back = switch_to_role(creds)
    secrets_to_update = [secret for secret in secrets if metadata[secret['Name']]['isUpdating']]
    secret_values_to_update = {secret['Name']: get_secret_value(secret['Source'], secret['Path'], role['Arn']) for secret in secrets_to_update}
    switch_back()
    
    print('creating docker secrets')
    for secret in secrets_to_update:
        full_name = get_secret_full_name(stack_name, secret['Name'], metadata[secret['Name']]['nextVersion'])
        output, ok = docker_secret_create(full_name, secret_values_to_update[secret['Name']])
        if ok:
            secret['_LastVersion'] = metadata[secret['Name']]['nextVersion']
            secret['_NextRefresh'] = secret.get('RefreshInterval') or 600 + now
        else:
            print(output)
    if role_is_updating:
        output, ok = docker_secret_create(get_secret_full_name(stack_name, role_secret_name, role_secret_next_version), json.dumps(creds))
        if ok:
            settings['_LastRoleVersion'] = role_secret_next_version
            expiration = datetime.fromisoformat(creds['Expiration'])
            epoch = datetime(1970, 1, 1)
            print(expiration, epoch)
            settings['_NextRoleRefresh'] = (expiration - epoch).total_seconds()
        else:
            print(output)

    compose_file = to_yaml({
        'version': '3.9',
        'services': {
            service['Name']: {
                'image': service['Image'],
                'environment': [
                    f'{variable["Name"]}={variable["Value"]}'
                    for variable in service['EnvironmentVariables']
                ],
                'secrets': [
                    {
                        'source': get_secret_full_name(stack_name, role_secret_name, role_secret_next_version),
                        'target': role_secret_name,
                        'mode': 440,
                    },
                    *[{
                        'source': get_secret_full_name(stack_name, name, metadata[name]['nextVersion']),
                        'target': name,
                        'mode': 440,
                    } for name in service['Secrets']],
                ],
                # 'logging': {
                #     'driver': 'awslogs',
                #     'options': {
                #         'awslogs-region': 'us-east-1',
                #         'awslogs-group': f'/app/{stack_name}/docker',
                #         'awslogs-create-group': 'true',
                #         # 'awslogs-multiline-pattern': service['Logging'].get('MultilinePattern'),
                #         # 'awslogs-datetime-format': service['Logging'].get('DateTimeFormat'),
                #     }
                # }
            } for service in services
        },
        'secrets': {
            get_secret_full_name(stack_name, role_secret_name, role_secret_next_version): {'external': True},
            **{get_secret_full_name(stack_name, secret['Name'], metadata[secret['Name']]['nextVersion']): {'external': True} for secret in secrets}
        }
    })

    with open(settings_file, 'w') as f:
        json.dump(settings, f, indent=4)
    
    output, ok = docker_stack_build(compose_file, stack_name)
    print(output)
    if ok:
        full_names = [
            get_secret_full_name(stack_name, secret['Name'], metadata[secret['Name']]['version']) 
            for secret in secrets_to_update 
            if not metadata[secret['Name']]['isNew']
        ]
        if role_is_updating and not role_is_new:
            full_names.append(get_secret_full_name(stack_name, role_secret_name, role_secret_version))
        output, ok = docker_secret_rm(*full_names)
        print(output)


if __name__ == '__main__':
    args = sys.argv[1:]
    if not len(args):
        print(f'usage: {sys.argv[0]} <settings-file>')
    main(args[0])
