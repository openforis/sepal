#!/usr/bin/env bash

openssl req\
 -newkey rsa:4096\
 -nodes \
 -sha256\
 -keyout docker-registry.key\
 -x509\
 -days 3650\
 -subj /O=SEPAL/CN=ops.sepal.io/subjectAltName=DNS:ops.sepal.io\
 -out docker-registry.crt\
 -days 3650