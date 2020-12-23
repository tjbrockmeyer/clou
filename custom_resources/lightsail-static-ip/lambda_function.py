from crhelper import CfnResource
import time
import logging
import boto3

logger = logging.getLogger(__name__)

helper = CfnResource(json_logging=False, log_level='ERROR', boto_level='CRITICAL', sleep_on_delete=120)


def allow_not_exists(f, *args, **kwargs):
    try:
        f(*args, **kwargs)
    except Exception as e:
        if '(NotFoundException)' not in str(e):
            raise


def attach(ls, static_ip_name, instance_name):
    state = ls.get_instance_state(instanceName=instance_name)['state']['name']
    while state != 'running':
        time.sleep(1)
        state = ls.get_instance_state(instanceName=instance_name)['state']['name']
    ls.attach_static_ip(staticIpName=static_ip_name,
                        instanceName=instance_name)


def detach(ls, static_ip_name):
    ls.detach_static_ip(staticIpName=static_ip_name)


@helper.create
def create(event, _):
    props = event['ResourceProperties']
    static_ip_name = props['StaticIpName']
    ls = boto3.client('lightsail')

    ls.allocate_static_ip(staticIpName=static_ip_name)
    if 'AttachToInstance' in props:
        attach(ls, static_ip_name, props['AttachToInstance'])
    return static_ip_name


@helper.update
def update(event, _):
    old_props = event['OldResourceProperties']
    props = event['ResourceProperties']
    static_ip_name = props['StaticIpName']
    ls = boto3.client('lightsail')

    physical_id = event['PhysicalResourceId']
    if static_ip_name != physical_id:
        logical_id = event['LogicalResourceId']
        raise Exception(f'In {logical_id}: cannot change the name of a lightsail static ip.')
    if 'AttachToInstance' in old_props:
        detach(ls, static_ip_name)
    if 'AttachToInstance' in props:
        attach(ls, static_ip_name, props['AttachToInstance'])
    return physical_id


@helper.delete
def delete(event, _):
    props = event['ResourceProperties']
    static_ip_name = props['StaticIpName']
    ls = boto3.client('lightsail')

    allow_not_exists(ls.release_static_ip, staticIpName=static_ip_name)


def handler(event, context):
    helper(event, context)
