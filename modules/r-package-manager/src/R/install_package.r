#!/usr/bin/env Rscript
# usage: <URL> <lib>

args = commandArgs(trailingOnly = TRUE)

url <- args[1]
version <- args[2]
lib <- args[3]

# install or update from local CRAN
install.packages(url, repos = NULL, type = 'source', lib = lib, quiet = TRUE)
