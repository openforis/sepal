package org.openforis.sepal.component.files.api

import groovy.transform.Immutable

@Immutable
class UserFile {
    String path
    long size
    boolean directory
    boolean archivable

    static UserFile fromFile(File file, boolean archivable = true) {
        new UserFile(
            path: file.path,
            size: file.size(),
            directory: file.directory,
            archivable: archivable
        )
    }

    String getName() {
        return new File(path).name
    }

    boolean exists() {
        new File(path).exists()
    }
}
