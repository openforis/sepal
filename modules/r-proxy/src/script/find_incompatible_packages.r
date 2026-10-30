#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)

lib <- args[1]

rMinorVersion <- paste(getRversion()$major, getRversion()$minor, sep = '.')

builtMinorVersion <- function(built)
    sub('^R ([0-9]+\\.[0-9]+).*', '\\1', built)

# Print each installed package with compiled code built under another R minor version, so the caller can
# invalidate and rebuild it: R keeps binary compatibility only within a minor version. Loading the code
# instead would run package initialization code, which can crash R.

for (pkg in list.dirs(lib, recursive = FALSE, full.names = FALSE)) {
    if (!dir.exists(file.path(lib, pkg, 'libs'))) {
        next
    }
    built <- suppressWarnings(packageDescription(pkg, lib.loc = lib, fields = 'Built'))
    if (is.na(built) || builtMinorVersion(built) != rMinorVersion) {
        writeLines(pkg)
    }
}
