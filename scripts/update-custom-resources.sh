#!/bin/bash

DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR/../lambda"

BUCKET=$(aws ssm get-parameter --name ' /global/bucket-name' --output text --query 'Parameter.Value')
for PACKAGE in custom-resource/*; do
    "$DIR/package-code.sh" "$BUCKET" "$PACKAGE" "$PACKAGE" \
        "mkdir site-packages 2>/dev/null" \
        "python -m pip install -q -r requirements.txt --target site-packages" \
        "echo no tests available" &
done
