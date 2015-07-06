package org.openforis.sepal.dataprovider

import groovy.transform.ToString

interface Scene {
    void add(FileStream fileStream)

    void addArchive(FileStream fileStream)
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

    void add(FileStream fileStream) {
        repository.addFileToScene(request, fileStream)
    }

    void addArchive(FileStream fileStream) {
        repository.addArchiveToScene(request, fileStream)
    }
}
