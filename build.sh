#!/bin/bash

printf $1 > VERSION \
  && TICKSCRIPT_STUDIO_BUILD_ENVIRONMENT=deploy  gulp build \
  && GOOS=linux GOARCH=amd64 GO15VENDOREXPERIMENT=true go build -v -o tickscript-studio $(ls -1 server | grep .go | sed -e 's/^/server\//g') \
  && docker build -t tickscript-studio:$1 .
