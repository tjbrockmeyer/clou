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
    key_pair_name = event['ResourceProperties']['KeyPairName']
    ls = boto3.client('lightsail')
    key_pair = ls.create_key_pair(keyPairName=key_pair_name)
    helper.Data['PrivateKey'] = key_pair['privateKeyBase64']
    helper.NoEcho = True
    return key_pair_name


@helper.update
def update(event, _):
    key_pair_name = event['ResourceProperties']['KeyPairName']
    physical_id = event['PhysicalResourceId']
    if key_pair_name != physical_id:
        logical_id = event['LogicalResourceId']
        raise Exception(f'In {logical_id}: cannot change the name of a lightsail key pair.')
    return physical_id


@helper.delete
def delete(event, _):
    key_pair_name = event['ResourceProperties']['KeyPairName']
    ls = boto3.client('lightsail')
    allow_not_exists(ls.delete_key_pair, keyPairName=key_pair_name)


def handler(event, context):
    helper(event, context)
