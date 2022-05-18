cd infra/aws/resources
LIST=
for FILE in *; do
PREFIX=""
DEPLOYMENTS=""
POSTFIX=""
while read DEPLOYMENT; do
    if [[ "$(yq ".deployments.$DEPLOYMENT.using" < "$FILE")" = lightsail-instance ]]; then
        PREFIX="-c $FILE"
        DEPLOYMENTS+=" $DEPLOYMENT"
        SERIAL="$(yq '.deployments.$DEPLOYMENT.parameters.AccessKeySerial' < "$FILE")"
        NEXT_SERIAL="$(( "$SERIAL" + 1 ))"
        yq -i ".deployments.$DEPLOYMENT.parameters.AccessKeySerial = $NEXT_SERIAL" "$FILE"
    fi
done <<< "$(yq '.deployments | keys | .[]' < "$FILE")"
LIST+=",\"$PREFIX$DEPLOYMENTS\""
done
LIST="[$(cut -c2- <<< "$LIST")]"
printf "$LIST\n"
echo "::set-output name=hasFiles::$([[ "$LIST" = '[]' ]] && echo false || echo true)"
echo "::set-output name=arguments::$(echo "$LIST")"