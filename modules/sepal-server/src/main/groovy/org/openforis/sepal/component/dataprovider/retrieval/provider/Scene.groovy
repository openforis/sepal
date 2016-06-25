package org.openforis.sepal.component.dataprovider.retrieval.provider

import org.openforis.sepal.component.dataprovider.SceneRequest
import org.openforis.sepal.component.dataprovider.retrieval.SceneRepository
import org.openforis.sepal.util.annotation.Data

interface Scene {
    void addFile(FileStream fileStream)

    void addArchive(FileStream fileStream)

}

@Data
class DefaultScene implements Scene {
    private final SceneRequest request
    private final SceneRepository repository

    DefaultScene(SceneRequest request, SceneRepository repository) {
        this.request = request
        this.repository = repository
        repository.createSceneDir(request)
    }


    @Override
    void addFile(FileStream fileStream) {
        repository.addFileToScene(request, fileStream)
    }

    @Override
    void addArchive(FileStream fileStream) {
        repository.addArchiveToScene(request, fileStream)
    }
}
