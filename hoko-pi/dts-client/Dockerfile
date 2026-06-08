# DTS Client SiDAP daemon — Unisys' Java uploader to the canton's SOAP/TLS
# endpoint. Multi-arch: works on amd64 + arm64 (Pi 4/5) because both the JRE
# and `jsvc` come from apt for the build arch.

FROM eclipse-temurin:17-jre-jammy

# jsvc = the Apache commons-daemon wrapper that the official install_service.sh
# uses to keep the daemon attached to stdin/stdout (we run with -nodetach so
# Docker sees the process).
# unzip = to extract the Unisys install package at build time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip jsvc ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dts-client

# The install zip is committed at the repo root under hoko-cli/. Build context
# is the repo root (set in docker-compose.yml).
COPY hoko-cli/dts-client-sidap-install.zip /tmp/install.zip
RUN unzip -q /tmp/install.zip -d /opt/dts-client \
 && rm /tmp/install.zip \
 && chmod +x /opt/dts-client/*.sh \
 && mkdir -p /opt/dts-client/Upload /var/log/SiDAP

COPY hoko-pi/dts-client/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
