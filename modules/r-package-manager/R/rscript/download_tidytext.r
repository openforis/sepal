#!/usr/bin/env Rscript

pkg_deps <- tools::package_dependencies("tidytext",
                            recursive = TRUE)
# add "tidytext" to the list
pkgs <- c(pkg_deps$tidytext, "tidytext")
download.packages(pkgs = pkgs, destdir = "/usr/local/lib/R/cranroot/src/contrib", type = "source")

tools::write_PACKAGES(dir = "/usr/local/lib/R/cranroot/src/contrib", type = "source")

#tools::write_PACKAGES(dir = "/usr/local/lib/R/cranroot/binary", type = "binary")
