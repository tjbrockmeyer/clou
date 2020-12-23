NAME=$1

if [[ -z "$NAME" ]]; then
  echo "For the first argument, pass the name of the custom resource. Possible options:"
  ls custom_resources
  exit 1
fi

aws cloudformation deploy \
  --stack-name "cfn-custom-resource-$NAME" \
  --template-file ./custom-resource-stack.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ResourceName=$NAME"

if [[ $? -eq 0 ]]; then
  echo Updating lambda code...
  pip install -t "custom_resources/$NAME" -r "custom_resources/$NAME/requirements.txt" >/dev/null
  (cd "custom_resources/$NAME" && 7z a -r "../$NAME.zip" * >/dev/null)
  aws lambda update-function-code --function-name "cfn-custom-resource-$NAME" --zip-file "fileb://custom_resources/$NAME.zip" >/dev/null
fi