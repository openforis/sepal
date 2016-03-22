#!/bin/bash

export GDAL_DRIVER_PATH=/opt/miniconda3/envs/arcsi/lib/gdalplugins
/opt/miniconda3/envs/arcsi/bin/arcsisolarirradiance.py "$@"