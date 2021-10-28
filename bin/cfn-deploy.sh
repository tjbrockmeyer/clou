#!/bin/bash

set -e

TEMPLATE_FILE="$1"
STACK_NAME="$2"

if [[ -n "$3" ]]; then
    PARAMETERS="--parameter-overrides ${@: 3}"
else
    PARAMETERS=""
fi

if [[ -z "$TEMPLATE_FILE" ]] || [[ -z "$STACK_NAME" ]]; then
    echo "usage: cfn-deploy.sh <template-file> <stack-name> [name=value]..."
    exit 1
fi

if aws ssm get-parameter --name ' /global/stack-notifications-topic-arn' --output text --query 'Parameter.Value' >/tmp/topic-arn 2>/dev/null
then
    echo Sending notifications to $(cat /tmp/topic-arn)...
    NOTIFICATIONS="--notification-arns $(cat /tmp/topic-arn)"
else
    echo Not sending any notifications...
    NOTIFICATIONS=""
fi

if ! aws cloudformation deploy \
    --template-file "$TEMPLATE_FILE" --stack-name "$STACK_NAME" \
    $NOTIFICATIONS \
    $PARAMETERS \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND
then
    echo 'Stack create/update failed:'
    aws cloudformation describe-stack-events --stack-name "$STACK_NAME" --max-items 30 \
        --output yaml \
        --query 'StackEvents[?contains(ResourceStatus, `_FAILED`)].{Status: ResourceStatus, Id: LogicalResourceId, Reason: ResourceStatusReason}'
fi

STATUS=$(aws cloudformation describe-stacks --stack-name="$STACK_NAME" --output text --query 'Stacks[0].StackStatus')
if [[ $STATUS == "ROLLBACK_COMPLETE" ]]; then
    aws cloudformation delete-stack --stack-name "$STACK_NAME"
fi

rm /tmp/topic-arn
