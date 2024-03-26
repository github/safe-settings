FROM node:20-alpine
WORKDIR /opt/safe-settings
ENV NODE_ENV production
## Set the Labels
LABEL version="1.0" \
      description="Probot app which is a modified version of Settings Probot GitHub App" \
      maintainer="GitHub Professional Services <services@github.com>"

## These files are copied separately to allow updates
## to the image to be as small as possible
COPY  package*.json /opt/safe-settings/
COPY  index.js /opt/safe-settings/
COPY  lib /opt/safe-settings/lib

## Install the app and dependencies
RUN npm ci

## This app will listen on port 3000
EXPOSE 3000

USER node

## This does not start properly when using the ['npm','start'] format
## so stick with just calling it outright
CMD npm start
