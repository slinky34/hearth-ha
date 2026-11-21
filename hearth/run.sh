#!/usr/bin/with-contenv bashio
bashio::log.info "Starting Hearth $(bashio::addon.version)"
export HEARTH_VERSION="$(bashio::addon.version)"
exec node /app/server/index.js
