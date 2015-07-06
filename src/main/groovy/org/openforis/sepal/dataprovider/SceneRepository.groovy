package org.openforis.sepal.dataprovider

import util.Tar

import java.nio.file.Files

interface SceneRepository {
    File addFileToScene(SceneRequest request, FileStream fileStream)

    void addArchiveToScene(SceneRequest request, FileStream fileStream)

    File createScene(request)
}

class FileSystemSceneRepository implements SceneRepository {
    private final File workingDir

    FileSystemSceneRepository(File workingDir) {
        this.workingDir = workingDir
    }

    File addFileToScene(SceneRequest request, FileStream fileStream) {
        def file = new File(sceneDir(request), fileStream.fileName)
        Files.copy(fileStream.stream, file.toPath())
        return file
    }

    void addArchiveToScene(SceneRequest request, FileStream fileStream) {
        def tarFile = addFileToScene(request, fileStream)
        Tar.unpackTarGz(tarFile)
    }

    File createScene(request) {
        File sceneDir = sceneDir(request)
        sceneDir.mkdirs()
        return sceneDir
    }

    private File sceneDir(SceneRequest request) {
        def requestDir = new File(workingDir, "" + request.id)
        def dataSetDir = new File(requestDir, request.sceneReference.dataSet.name())
        new File(dataSetDir, request.sceneReference.id)
    }
}

