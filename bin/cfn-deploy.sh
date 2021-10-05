
if aws ssm get-parameter --name ' /global/stack-notifications-topic-arn' --output text --query 'Parameter.Value' >./tmp-topic-arn 2>/dev/null
then
    echo Sending notifications to $(cat ./tmp-topic-arn)...
    NOTIFICATIONS="--notification-arns $(cat ./tmp-topic-arn)"
else
    echo Not sending any notifications...
    NOTIFICATIONS=""
fi

if [[ -n "$3" ]]; then
    PARAMETERS="--parameter-overrides ${@: 3}"
else
    PARAMETERS=""
fi

if ! aws cloudformation deploy \
    --template-file "$1" --stack-name "$2" \
    $NOTIFICATIONS \
    $PARAMETERS \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND 2>/dev/null
then
    echo 'Stack create/update failed:'
    aws cloudformation describe-stack-events --stack-name "$2" --max-items 30 \
        --output yaml \
        --query 'StackEvents[?contains(ResourceStatus, `_FAILED`)].{Status: ResourceStatus, Id: LogicalResourceId, Reason: ResourceStatusReason}'
fi

STATUS=$(aws cloudformation describe-stacks --stack-name="$2" --output text --query 'Stacks[0].StackStatus')
if [[ $STATUS == "ROLLBACK_COMPLETE" ]]; then
    aws cloudformation delete-stack --stack-name "$2"
fi

rm ./tmp-topic-arn