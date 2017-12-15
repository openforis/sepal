package org.openforis.sepal.component.budget.adapter

import org.openforis.sepal.component.files.FilesComponent
import org.openforis.sepal.component.files.query.GbUsed

interface UserFiles {
    double gbUsed(String username)
}

class FilesComponentBackedUserFiles implements UserFiles {
    private final FilesComponent filesComponent

    FilesComponentBackedUserFiles(FilesComponent filesComponent) {
        this.filesComponent = filesComponent
    }

    double gbUsed(String username) {
        return filesComponent.submit(new GbUsed(username))
    }
}
