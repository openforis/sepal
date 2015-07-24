package org.openforis.sepal.scene.retrieval

import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.retrieval.provider.FileStream
import org.openforis.sepal.util.Tar

import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.regex.Pattern

interface SceneRepository {

    File addFileToScene(SceneRequest request, FileStream fileStream)

    void addArchiveToScene(SceneRequest request, FileStream fileStream)

    File createSceneDir(request)

    File getSceneWorkingDirectory(SceneRequest request)

    File getSceneHomeDirectory(SceneRequest request)

}

class FileSystemSceneRepository implements SceneRepository {
    private final File workingDir
    private final String homeDir

    FileSystemSceneRepository(File workingDir, String homeDir) {
        this.workingDir = workingDir
        this.homeDir = homeDir
    }

    @Override
    File getSceneHomeDirectory(SceneRequest request) {
        def userHomeDirectory = userHomeDir(request.userName)
        File sceneHomeDir = new File(userHomeDirectory, request.sceneReference.id)
        sceneHomeDir.mkdirs()
        return sceneHomeDir
    }

    @Override
    File getSceneWorkingDirectory(SceneRequest request) {
        return sceneDir(request)
    }

    File addFileToScene(SceneRequest request, FileStream fileStream) {
        def file = new File(sceneDir(request), fileStream.fileName)
        Files.copy(fileStream.stream, file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        return file
    }

    void addArchiveToScene(SceneRequest request, FileStream fileStream) {
        def tarFile = addFileToScene(request, fileStream)
        Tar.unpackTarGz(tarFile)
    }

    File createSceneDir(request) {
        File sceneDir = sceneDir(request)
        sceneDir.mkdirs()
        return sceneDir
    }

    private File sceneDir(SceneRequest request) {
        def requestDir = new File(workingDir, "" + request.id)
        def dataSetDir = new File(requestDir, request.sceneReference.dataSet.name())
        new File(dataSetDir, request.sceneReference.id)
    }

    private File userHomeDir(String userName) {
        def userHomeDir = new File(homeDir.replaceAll(Pattern.quote('\$user'), userName))
        userHomeDir.mkdirs()
        return userHomeDir
    }
}

