#!/usr/bin/env Rscript

args = commandArgs(trailingOnly = TRUE)

name <- args[1]
version <- args[2]
lib <- args[3]
repo <- args[4]

library(remotes)

# install requested library from CRAN repository

.libPaths(lib)

# install.packages() only warns when a package fails to install. A previously installed version would
# then pass the load check below and get bundled under the requested version.
withCallingHandlers(
    install_version(name, version = version, repos = repo, lib = lib, upgrade = 'always'),
    warning = function(w) if (grepl('had non-zero exit status', conditionMessage(w))) stop(conditionMessage(w), call. = FALSE)
)

# check if library can be loaded, otherwise uninstall it and fail

if ( ! library(name, lib.loc = lib, character.only = TRUE, logical.return = TRUE) ) {
    remove.packages(name, lib = lib)
    quit(status = 3, save = 'no')
}
