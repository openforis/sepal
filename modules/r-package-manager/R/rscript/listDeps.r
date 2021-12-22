#!/usr/bin/env Rscript

# get package name
args = commandArgs(trailingOnly = TRUE)
package <- args[1]

# get dependencies for package
package_dependencies <- tools::package_dependencies(package, recursive = TRUE)[[package]]

# add package name
packages <- c(package, package_dependencies)

# print packages
write(packages, stdout())

# download packages
install.packages(packages)
