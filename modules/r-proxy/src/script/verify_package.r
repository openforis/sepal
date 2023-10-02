#!/usr/bin/env Rscript

args = commandArgs(trailingOnly = TRUE)

name <- args[1]
path <- args[2]
lib <- args[3]

library(remotes)

# install requested library from local file

install.packages(path, repos = NULL, lib = lib)

# check if library can be loaded, otherwise uninstall it and fail

if ( ! library(name, lib.loc = lib, character.only = TRUE, logical.return = TRUE) ) {
    remove.packages(name, lib = lib)
    quit(status = 3, save = 'no')
}
