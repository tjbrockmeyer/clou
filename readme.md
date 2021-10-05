# AWS Helper

This project is for getting up and running with AWS on a budget.
There are cloudformation templates in place for running docker containers on simple lightsail instances with static IPs.


## Getting Started

Just before jumping in, note that you can use the convenience script `bin/cfn-deploy.sh` to deploy any templates. 
It requires two parameters, `TEMPLATE_FILE` and `STACK_NAME`.
Any parameters after those two should be provided in the `Key=Value` format, because they will be interpreted as parameters.

Moving on... there is a required order for running these templates.

Start with `templates/main.yml`, which can be run with no parameters.
This template will create an S3 bucket for storing a couple of templates and some code packages to make things more convenient.

After that, you can run `scripts/sync-templates.sh`, which also does not require any arguments.
This script will upload the templates in the `templates` directory to S3.

Next, we will need to run `update-custom-resources.sh` to get our custom resources available for use in the remaining templates.
These include lightsail resources and a secure string resource.

Once the custom resources are created, you are free to begin creating lightsail instances using `templates/lightsail-instance.yml` and deploying your projects to your instances by using `templates/project.yml`.
