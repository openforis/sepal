package org.openforis.sepal.component.files.query

import groovy.transform.Immutable
import org.openforis.sepal.component.files.internal.UserDir
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class FileSize implements Query<Long> {
    String username
    String path
}

class FileSizeHandler implements QueryHandler<Long, FileSize> {
    private final File homeDir

    FileSizeHandler(File homeDir) {
        this.homeDir = homeDir
    }

    Long execute(FileSize query) {
        new UserDir(homeDir, query.username).fileSize(query.path)
    }
}
