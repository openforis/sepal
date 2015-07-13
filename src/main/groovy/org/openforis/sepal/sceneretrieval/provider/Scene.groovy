package org.openforis.sepal.sceneretrieval.provider

import groovy.transform.ToString

interface Scene {
    void addFile(FileStream fileStream)

    void addArchive(FileStream fileStream)

   }

interface ProgressCallback {
    void progress(int size)
}

@ToString
class DefaultScene implements Scene {
    private final SceneRequest request
    private final SceneRepository repository

    DefaultScene(SceneRequest request, SceneRepository repository) {
        this.request = request
        this.repository = repository
        repository.createScene(request)
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
