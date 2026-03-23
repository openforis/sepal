#!/bin/bash

/root/.lmstudio/bin/lms link enable
/root/.lmstudio/bin/lms server start --bind 0.0.0.0 --port 1234

sleep infinity
