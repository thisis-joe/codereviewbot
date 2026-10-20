#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --set=bot_pass="$BOT_DB_PASSWORD" --set=n8n_pass="$N8N_DB_PASSWORD" <<'SQL'
CREATE USER reviewbot WITH PASSWORD :'bot_pass';
CREATE DATABASE reviewbot OWNER reviewbot;
CREATE USER n8n WITH PASSWORD :'n8n_pass';
CREATE DATABASE n8n OWNER n8n;
SQL
