#!/bin/bash

# Run this file on first time setup of codebuild

if [[ -z $1 ]]; then
  echo "Argument 0 should be a Github Personal Access Token that you set up"
  echo "Set one up here: https://github.com/settings/tokens"
  exit 1
fi

TOKEN="$1"

aws codebuild import-source-credentials --token "$TOKEN" --server-type GITHUB --auth-type PERSONAL_ACCESS_TOKEN