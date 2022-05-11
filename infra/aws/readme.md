# AWS Helper

This project is for getting up and running with AWS on a budget.
There are cloudformation templates in place for running docker containers on simple lightsail instances with static IPs.

## Dependencies

You'll need `jq`, `yq`, the GitHub CLI and the AWS CLI.

## Getting Started

Create main stack along with all custom resources:
```
cd resources
../bin/infra

cd ../lambda
for DIR in *; do
  cd $DIR
  ../../bin/infra &
  cd ..
done
```

Add community resource to our registry (must be done in every account and region that needs it):
```
aws cloudformation register-type \
  --region us-east-1 \
  --type-name "Community::CloudFormation::Delay" \
  --schema-handler-package "s3://community-resource-provider-catalog/community-cloudformation-delay-0.1.0.zip" \
  --type RESOURCE
```
