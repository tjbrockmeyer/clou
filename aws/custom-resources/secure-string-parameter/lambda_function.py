from crhelper import CfnResource
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


@helper.create
def create(event, _):
    props = event['ResourceProperties']
    name = props['Name']
    value = props['Value']
    description = props.get('Description')
    ssm = boto3.client('ssm')

    ssm.put_parameter(Name=name, Description=description, Type='SecureString', Value=value)
    return name


@helper.update
def update(event, _):
    props = event['ResourceProperties']
    name = props['Name']
    value = props['Value']
    description = props.get('Description')
    ssm = boto3.client('ssm')

    physical_id = event['PhysicalResourceId']
    if name != physical_id:
        logical_id = event['LogicalResourceId']
        raise Exception(f'In {logical_id}: cannot change the name of a secure string parameter.')
    ssm.put_parameter(Name=name, Description=description, Type='SecureString', Value=value, Overwrite=True)
    return physical_id


@helper.delete
def delete(event, _):
    props = event['ResourceProperties']
    name = props['Name']
    ssm = boto3.client('ssm')

    allow_not_exists(ssm.delete_parameter, Name=name)


def handler(event, context):
    helper(event, context)
