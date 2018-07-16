#!/bin/bash

printf "$1" > VERSION \
  && TICKSCRIPT_STUDIO_BUILD_ENVIRONMENT=deploy  gulp build \
  && GOOS=linux GOARCH=amd64 GO15VENDOREXPERIMENT=1 go build -v -o tickscript-studio $(ls -1 server | grep .go | sed -e 's/^/server\//g') \
  && docker build -t sequentialread/tickscript-studio:$1 .
