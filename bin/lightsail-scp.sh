#!/bin/bash

set -e


INSTANCE="$1"
LOCAL_FILE="$2"
REMOTE_FILE="$3"

if [[ -z "$INSTANCE" ]] || [[ -z "$LOCAL_FILE" ]] || [[ -z "$REMOTE_FILE" ]]; then
    echo "usage: lightsail-ssh.sh <lightsail-instance-name> <local-file> <remote-file>"
    exit 1
fi

PUBLIC_IP=$(aws lightsail get-instance --instance-name "$INSTANCE" --output text --query instance.publicIpAddress)
USER=$(aws lightsail get-instance --instance-name "$INSTANCE" --output text --query instance.username)
IDENTITY=/tmp/lightsail-private-key
KNOWN_HOSTS=/tmp/known_hosts
if [[ -e "$IDENTITY" ]]; then rm -f "$IDENTITY"; fi
if [[ -e "$KNOWN_HOSTS" ]]; then rm -f "$KNOWN_HOSTS"; fi
HOST="$USER@$PUBLIC_IP"
OPTS="-i $IDENTITY -o UserKnownHostsFile=$KNOWN_HOSTS"

ssh-keyscan "$PUBLIC_IP" >> "$KNOWN_HOSTS" 2>/dev/null
printf -- "$(aws ssm get-parameter --name " /lightsail/$INSTANCE/private-key" --with-decryption --output text --query 'Parameter.Value')" > "$IDENTITY"
chmod 400 "$IDENTITY"

scp $OPTS "$LOCAL_FILE" "$HOST:$REMOTE_FILE"