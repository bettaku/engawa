#!/bin/bash

# This is a script to generate a self-signed certificate to use Elasticsearch for local development.

# Config
CERT_DIR="./certs"
CERT_NAME="elasticsearch"
DAYS_VALID="365"
KEY_FILE="${CERT_DIR}/${CERT_NAME}.key"
CSR_FILE="${CERT_DIR}/${CERT_NAME}.csr"
CRT_FILE="${CERT_DIR}/${CERT_NAME}.crt"
P12_FILE="${CERT_DIR}/${CERT_NAME}.p12"
P12_PASSWORD="password"

# Create the certificate directory
mkdir -p ${CERT_DIR}

# Gen private key
openssl genpkey -algorithm RSA -out ${KEY_FILE} -pkeyopt rsa_keygen_bits:4096
echo "Generated private key: ${KEY_FILE}"

#Gen CSR
openssl req -new -key ${KEY_FILE} -out ${CSR_FILE} -subj "/CN=${CERT_NAME}"
echo "Generated CSR: ${CSR_FILE}"

# Gen CRT
openssl x509 -req -days ${DAYS_VALID} -in ${CSR_FILE} -signkey ${KEY_FILE} -out ${CRT_FILE}
echo "Generated CRT: ${CRT_FILE}"

# Gen P12
openssl pkcs12 -export -in ${CRT_FILE} -inkey ${KEY_FILE} -name "${CERT_NAME}" -password pass:${P12_PASSWORD} -out ${P12_FILE}
echo "Generated P12: ${P12_FILE}"
