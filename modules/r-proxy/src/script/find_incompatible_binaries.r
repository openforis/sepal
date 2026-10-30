#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)

rMinorVersion <- paste(getRversion()$major, getRversion()$minor, sep = '.')

builtMinorVersion <- function(built)
    sub('^R ([0-9]+\\.[0-9]+).*', '\\1', built)

# Print each binary package file under the given directories whose compiled code was built under another R
# minor version: R keeps binary compatibility only within a minor version. A file that can't be read is
# printed as well.

isIncompatible <- function(file) {
    entries <- untar(file, list = TRUE)
    description <- grep('^[^/]+/DESCRIPTION$', entries, value = TRUE)[1]
    if (is.na(description) || !any(grepl('^[^/]+/libs/', entries))) {
        return(FALSE)
    }
    exdir <- tempfile()
    on.exit(unlink(exdir, recursive = TRUE))
    untar(file, files = description, exdir = exdir)
    built <- read.dcf(file.path(exdir, description), fields = 'Built')[1, 'Built']
    is.na(built) || builtMinorVersion(built) != rMinorVersion
}

for (file in list.files(args, pattern = '\\.tar\\.gz$', recursive = TRUE, full.names = TRUE)) {
    if (tryCatch(isIncompatible(file), error = function(e) TRUE, warning = function(w) TRUE)) {
        writeLines(file)
    }
}
