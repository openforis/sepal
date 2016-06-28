package org.openforis.sepal.component.files.query

import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.ImmutableData

import static org.openforis.sepal.component.files.query.ReadFile.InvalidPath

@ImmutableData
class ReadFile implements Query<InputStream> {
    String username
    String path

    static class InvalidPath extends RuntimeException {
        InvalidPath(String message, ReadFile query) {
            super("${message}: path: $query.path, username: $query.username")
        }
    }
}

class ReadFileHandler implements QueryHandler<InputStream, ReadFile> {
    private final File homeDir

    ReadFileHandler(File homeDir) {
        this.homeDir = homeDir
    }

    InputStream execute(ReadFile query) {
        def userDir = new File(homeDir, query.username).canonicalFile
        def file = new File(userDir, query.path).canonicalFile
        if (!file.exists())
            throw new InvalidPath('Path point to a non-existing file', query)
        if (file.isDirectory())
            throw new InvalidPath('Path point to a directory', query)
        if (!file.absolutePath.startsWith(userDir.absolutePath))
            throw new InvalidPath('Path outside of user directory', query)
        return file.newInputStream()
    }
}
