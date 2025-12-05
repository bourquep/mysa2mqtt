ARG BUILD_FROM
FROM $BUILD_FROM

# Set mysa2mqtt version
ARG mysa2mqttRevision=1.2.2

# Install requirements for add-on
RUN \
  apk add --no-cache \
    nodejs \
    npm

RUN npm install -g "mysa2mqtt@${mysa2mqttRevision}"

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
