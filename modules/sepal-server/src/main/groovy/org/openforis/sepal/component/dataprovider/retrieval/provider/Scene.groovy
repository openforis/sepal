package org.openforis.sepal.component.dataprovider.retrieval.provider

import groovy.transform.ToString
import org.openforis.sepal.component.dataprovider.SceneRequest
import org.openforis.sepal.component.dataprovider.retrieval.SceneRepository

interface Scene {
    void addFile(FileStream fileStream)

    void addArchive(FileStream fileStream)

}

@ToString
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
