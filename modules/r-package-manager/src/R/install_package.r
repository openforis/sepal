#!/usr/bin/env Rscript

args = commandArgs(trailingOnly = TRUE)

name <- args[1]
version <- args[2]
repo <- args[3]

library(remotes)

install_version(name, version = version, repos = repo)
