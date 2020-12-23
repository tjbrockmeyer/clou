#!/bin/bash

increment_version() {
  local delimiter=.
  local array=($(echo "$1" | tr $delimiter '\n'))
  array[$2]=$((array[$2]+1))
  if [ $2 -lt 2 ]; then array[2]=0; fi
  if [ $2 -lt 1 ]; then array[1]=0; fi
  echo $(local IFS=$delimiter ; echo "${array[*]}")
}

printf -- ""

VERSION=$(git describe --abbrev=0)
NEW_VERSION=$(increment_version $VERSION $1)
echo "Tagging version: $VERSION"
git tag -a $VERSION -m "Release $VERSION"
echo "Pushing to remote..."
git push origin $VERSION