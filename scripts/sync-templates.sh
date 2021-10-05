
aws ssm get-parameter --name /bucket-name --output text --query '.Value'
aws s3api put-object 