#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)

lib <- args[1]

.libPaths(lib)

# Attempt to load each installed package's compiled .so under the current R.
# A failure means the binary was compiled against a different R ABI; print the
# package name so the caller can invalidate and rebuild it.

for (pkg in list.dirs(lib, recursive = FALSE, full.names = FALSE)) {
    sos <- list.files(file.path(lib, pkg, 'libs'), pattern = '\\.so$', full.names = TRUE)
    for (so in sos) {
        ok <- tryCatch({dyn.load(so); dyn.unload(so); TRUE}, error = function(e) FALSE)
        if (!ok) {
            cat(pkg, '\n')
            break
        }
    }
}
