#!/usr/bin/env Rscript

args = commandArgs(trailingOnly = TRUE)

name <- args[1]
path <- args[2]
lib <- args[3]

library(remotes)

# install requested library from local file

install.packages(path, repos = NULL, lib = lib)

# check if library can be loaded, otherwise uninstall it and fail

if ( ! library(name, character.only = TRUE, logical.return = TRUE, lib.loc = lib) ) {
    remove.packages(name)
    quit(status = 3, save = 'no')
}
