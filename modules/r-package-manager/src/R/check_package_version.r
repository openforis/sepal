#!/usr/bin/env Rscript
# usage: <package> <version>

args = commandArgs(trailingOnly = TRUE)

package <- args[1]
version <- args[2]

result <- packageVersion(package) < version

cat(result)
