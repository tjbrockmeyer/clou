from crhelper import CfnResource
import time
import logging
import boto3

logger = logging.getLogger(__name__)

helper = CfnResource(json_logging=False, log_level='ERROR', boto_level='CRITICAL', sleep_on_delete=120)

user_script = r"""
sudo yum update -y
sudo amazon-linux-extras install docker
sudo service docker start
sudo usermod -a -G docker ec2-user
"""


def allow_not_exists(f, *args, **kwargs):
    try:
        f(*args, **kwargs)
    except Exception as e:
        if '(NotFoundException)' not in str(e):
            raise


def wait_while_pending(ls, instance_name):
    state = ls.get_instance_state(instanceName=instance_name)['state']['name']
    while state == 'pending':
        time.sleep(1)
        state = ls.get_instance_state(instanceName=instance_name)['state']['name']


def attach(ls, static_ip_name, instance_name):
    wait_while_pending(ls, instance_name)
    ls.attach_static_ip(staticIpName=static_ip_name,
                        instanceName=instance_name)


def detach(ls, static_ip_name):
    ls.detach_static_ip(staticIpName=static_ip_name)


@helper.create
def create(event, _):
    props = event['ResourceProperties']
    name = props['InstanceName']
    key_pair_name = props['KeyPairName']
    static_ip_name = props.get('StaticIpName')
    ls = boto3.client('lightsail')

    ls.create_instances(instanceNames=[name],
                        availabilityZone='us-east-1a',
                        blueprintId='amazon_linux_2',
                        bundleId='nano_2_0',
                        userData=user_script,
                        keyPairName=key_pair_name)
    if static_ip_name:
        attach(ls, static_ip_name, name)
    return name


@helper.update
def update(event, _):
    props = event['ResourceProperties']
    name = props['InstanceName']
    key_pair_name = props['KeyPairName']
    static_ip_name = props.get('StaticIpName')
    old_props = event['ResourceProperties']
    ls = boto3.client('lightsail')

    physical_id = event['PhysicalResourceId']
    instance = ls.get_instance(instanceName=physical_id)['instance']
    if name != physical_id:
        logical_id = event['LogicalResourceId']
        raise Exception(f'In {logical_id}: cannot change the name of a lightsail instance.')
    if key_pair_name != instance['sshKeyName']:
        logical_id = event['LogicalResourceId']
        raise Exception(f'In {logical_id}: cannot change the key-pair of a lightsail instance.')

    if 'StaticIpName' in old_props:
        detach(ls, old_props['StaticIpName'])
    if static_ip_name:
        attach(ls, static_ip_name, name)
    return name


@helper.delete
def delete(event, _):
    props = event['ResourceProperties']
    name = props['InstanceName']
    ls = boto3.client('lightsail')

    wait_while_pending(ls, name)
    allow_not_exists(ls.delete_instance, instanceName=name)


def handler(event, context):
    helper(event, context)
