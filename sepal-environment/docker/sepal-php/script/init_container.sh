#!/usr/bin/env bash

useradd sdms-admin -d "/data/home/sdms-admin"
echo sdms-admin:${ADMIN_PWD} | chpasswd