#!/bin/bash

S3_BUCKET="$1"
S3_KEY="$2"
DIR="$3"
PREP_CMD="$4"
INSTALL_CMD="$5"
TEST_CMD="$6"

NAME="$(basename "$DIR")"

mkdir -p "/tmp/$NAME"
cp -r $DIR/* "/tmp/$NAME/"
cd "/tmp/$NAME"

bash -c "$PREP_CMD"

if ! bash -c "$INSTALL_CMD"; then
    echo "installation command failed - please fix any issues and try again"
    exit 1
fi

if ! bash -c "$TEST_CMD"; then
    echo "some tests failed - please fix any issues and try again"
    exit 1
fi

zip -rq "/tmp/$NAME.zip" .

aws s3api put-object --bucket "$S3_BUCKET" --key "code/$S3_KEY.zip" --body "/tmp/$NAME.zip" >/dev/null

rm -rf "/tmp/$NAME"
rm -rf "/tmp/$NAME.zip"

printf -- "code packaging finished for $NAME\n"
