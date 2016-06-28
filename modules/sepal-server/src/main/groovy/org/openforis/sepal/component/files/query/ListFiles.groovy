package org.openforis.sepal.component.files.query

import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.ImmutableData

import static org.openforis.sepal.component.files.query.ListFiles.InvalidPath

@ImmutableData
class ListFiles implements Query<List<File>> {
    String username
    String path
    static class InvalidPath extends RuntimeException {
        InvalidPath(String message, ListFiles query) {
            super("${message}: path: $query.path, username: $query.username")
        }
    }
}

class ListFilesHandler implements QueryHandler<List<File>, ListFiles> {
    private final File homeDir

    ListFilesHandler(File homeDir) {
        this.homeDir = homeDir
    }

    List<File> execute(ListFiles query) {
        def userDir = new File(homeDir, query.username).canonicalFile
        def dir = new File(userDir, query.path).canonicalFile
        if (!dir.isDirectory())
            throw new InvalidPath('Path does not point to a directory', query)
        if (!dir.absolutePath.startsWith(userDir.absolutePath))
            throw new InvalidPath('Path outside of user directory', query)
        return dir.listFiles().toList()
    }
}
