-- Create one database per federation test site on the shared postgres server.
-- Runs automatically on first initialization via /docker-entrypoint-initdb.d.
CREATE DATABASE cherrypick_a;
CREATE DATABASE cherrypick_b;
CREATE DATABASE cherrypick_c;
