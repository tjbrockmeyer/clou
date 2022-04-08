# AWS Helper

This project is for getting up and running with AWS on a budget.
There are cloudformation templates in place for running docker containers on simple lightsail instances with static IPs.

## Dependencies

You'll need `jq`, the GitHub CLI and the AWS CLI.

## Getting Started

Just before jumping in, note that you can use the convenience script `bin/cfn-deploy` to deploy any templates. 
It requires two parameters, `TEMPLATE_FILE` and `STACK_NAME`.
Any parameters after those two should be provided in the `Key=Value` format, because they will be interpreted as stack parameters.

Create a `config/preferences.json` file if you don't have one, and you'll need to fill in the following:
  * Create `github-runner.repos` as a list of `OWNER/REPO` strings that you'd like to use github actions with.
    * They will be automatically given the secrets created for your github runner, and the secret will be easily refreshable.

Start by running `main/init`. This will create all the resources you need up-front.
