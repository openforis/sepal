package org.openforis.sepal.component.files.query

import org.openforis.sepal.component.files.internal.UserDir
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class ReadFile implements Query<InputStream> {
    String username
    String path
}

class ReadFileHandler implements QueryHandler<InputStream, ReadFile> {
    private final File homeDir

    ReadFileHandler(File homeDir) {
        this.homeDir = homeDir
    }

    InputStream execute(ReadFile query) {
        new UserDir(homeDir, query.username).read(query.path)
    }
}
