#!/usr/bin/env Rscript

args = commandArgs(trailingOnly = TRUE)

name <- args[1]
version <- args[2]
lib <- args[3]
repo <- args[4]

library(remotes)

# install requested library from CRAN repository

install_version(name, version = version, repos = repo, lib = lib)

# check if library can be loaded

if ( ! library(name, character.only = TRUE, logical.return = TRUE) ) {
    quit(status = 3, save = 'no')
}
