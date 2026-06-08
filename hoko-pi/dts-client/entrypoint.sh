#!/bin/sh
# Renders the SiDAP_default.ini at startup from env vars (so creds + URL
# aren't baked into the image), encrypts the password into the config via
# the bundled SetPassword util, then runs the daemon under jsvc so Docker
# captures stdout/stderr.

set -eu

cd /opt/dts-client

: "${SIDAP_URL:=https://sidap.hotelkontrolle.zh.ch/DtsApplService}"
: "${SIDAP_USER:?Set SIDAP_USER in .env}"
: "${SIDAP_PASS:?Set SIDAP_PASS in .env}"

CONFIG=config/SiDAP_default.ini

# Idempotent INI patches — sed in-place. The shipped default file already has
# the keys, we just replace the values so re-runs stay deterministic.
sed -i "s|^baseServiceUrl = .*|baseServiceUrl = ${SIDAP_URL}|" "$CONFIG"
sed -i "s|^serviceUser = .*|serviceUser = ${SIDAP_USER}|" "$CONFIG"

# SetPassword encrypts the cleartext password into the same config file.
# Runs as a one-shot, then we hand off to the daemon.
java -cp dts-client-sidap.jar:lib/* \
     -Dlog.dir=/var/log/SiDAP \
     com.unisys.ch.dts.client.SetPassword "$SIDAP_PASS"

echo "[entrypoint] config:"
grep -E "^(serviceName|baseServiceUrl|serviceUser|proxyEnabled|logLevel)" "$CONFIG"

# Run the daemon in the foreground. The Daemon class implements
# org.apache.commons.daemon.Daemon, which jsvc calls into. -nodetach keeps
# stdout/stderr attached to PID 1 so `docker logs` works.
exec jsvc \
  -nodetach \
  -outfile '&1' \
  -errfile '&2' \
  -user root \
  -cp dts-client-sidap.jar:lib/* \
  -Dlog.dir=/var/log/SiDAP \
  com.unisys.ch.dts.client.Daemon
