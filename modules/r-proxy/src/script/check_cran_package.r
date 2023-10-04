#!/usr/bin/env Rscript

args = commandArgs(trailingOnly = TRUE)

name <- args[1]
version <- args[2]
lib <- args[3]

.libPaths(lib)

if ( ! packageVersion(name, lib.loc = lib) == version) {
    quit(status = 10, save = 'no')
}
