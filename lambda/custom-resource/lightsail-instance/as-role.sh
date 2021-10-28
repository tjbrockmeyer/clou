#!/bin/bash
set -e

ROLE_ARN="$1"

if [[ -z "$ROLE_ARN" ]] || [[ -z "$2" ]]; then
    echo "usage: as-role <role-arn> <command1> [command2]..."
    exit 1
fi

RESULT="$(aws sts assume-role --role-arn "$ROLE_ARN" --role-session-name "lightsail-$LIGHTSAIL_INSTANCE_NAME-session" --output json --query Credentials)"

echo "$RESULT"
AWS_ACCESS_KEY_ID="$(jq -r .AccessKeyId <<< "$RESULT")" \
AWS_SECRET_ACCESS_KEY="$(jq -r .SecretAccessKey <<< "$RESULT")" \
AWS_SESSION_TOKEN="$(jq -r .SessionToken <<< "$RESULT")" \
${@: 2}
