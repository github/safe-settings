FROM node:16-alpine
ENV NODE_ENV production
## Set the Labels
LABEL version="1.0" \
      description="Probot app which is a modified version of Settings Probot GitHub App" \
      maintainer="GitHub Professional Services <services@github.com>"

USER node
## Set our working directory
WORKDIR /opt/safe-settings

## These files are copied separately to allow updates
## to the image to be as small as possible
COPY  package.json /opt/safe-settings/
COPY  index.js /opt/safe-settings/
COPY  lib /opt/safe-settings/lib

## You should edit .env.example and save it before building this image
## Future updates to this Dockerfile _may_ move this over to
## pure environment variables in Docker, so it can be passed at the CLI.
## This will be purely based on demand
##COPY  .env /opt/safe-settings/

## This can probably be removed, but users will have to make sure they
## run the container, then copy the key. This helps avoid that for folks
## using this in their enterprise environments
#COPY --chown=node:node .ssh/safe-settings.pem /opt/safe-settings/.ssh/

## Best practice, don't run as `root`
USER node

#
## Not strictly necessary, but set permissions to 400
#RUN chmod 400 /opt/safe-settings/.ssh/safe-settings.pem /opt/safe-settings/.env

## Install the app and dependencies
RUN npm install

## This app will listen on port 3000
EXPOSE 3000

## This does not start properly when using the ['npm','start'] format
## so stick with just calling it outright
CMD npm start
