#!/bin/bash

VERSION="$1"

if [[ -z "$VERSION" ]]; then
    echo "usage: update-custom-resources.sh <version-number>"
    exit 1
fi

DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR/../lambda"

BUCKET=$(aws ssm get-parameter --name ' /global/bucket-name' --output text --query 'Parameter.Value')
for PACKAGE in custom-resource/*; do
    if [[ -e "$PACKAGE/requirements.txt" ]]; then
        "$DIR/package-code.sh" "$PACKAGE" "$BUCKET" "$PACKAGE/v$VERSION" \
            "mkdir site-packages 2>/dev/null" \
            "python -m pip install -q -r requirements.txt --target site-packages" &
    elif [[ -e "$PACKAGE/package.json" ]]; then
        "$DIR/package-code.sh" "$PACKAGE" "$BUCKET" "$PACKAGE/v$VERSION" \
            "" "NODE_ENV=production npm ci --silent" &
    else 
        echo "update-custom-resources.sh: no valid packaging command for this directory: $PACKAGE"
    fi
done
wait

cd "$DIR/.."
./bin/cfn-deploy.sh templates/custom-resources.yml custom-resources "CodeVersion=v$VERSION"