#!/usr/bin/env Rscript

# this <package> /R/cranroot

args = commandArgs(trailingOnly = TRUE)

pkg <- args[1]
cranroot <- args[2]

pkgs <- package

pkg_deps <- tools::package_dependencies(pkg, recursive = TRUE)[[package]]
# add "tidytext" to the list
pkgs <- c(pkg, pkg_deps)

download.packages(pkgs = pkgs, destdir = "/usr/local/lib/R/cranroot/src/contrib", type = "source")

tools::write_PACKAGES(dir = "/usr/local/lib/R/cranroot/src/contrib", type = "source")
