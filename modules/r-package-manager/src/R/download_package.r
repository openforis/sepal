#!/usr/bin/env Rscript
# usage: <package> <cranroot>

args = commandArgs(trailingOnly = TRUE)

package <- args[1]
cranroot <- args[2]

pkgs <- package

localRepo <- paste('file:', cranroot, sep = '')
destDir = paste(cranroot, '/src/contrib', sep = '')

# donwload to local CRAN
downloaded <- download.packages(pkgs = pkgs, destdir = destDir, type = 'source', quiet = TRUE)

# return package path
cat(downloaded[1, 2])
