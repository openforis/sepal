package org.openforis.sepal.dataprovider

import org.slf4j.Logger
import org.slf4j.LoggerFactory


interface SceneDownloadCoordinator {

    public void withScene(SceneRequest request, double sizeInBytes, Closure closure)
}

class FileSystemSceneDownloadCoordinator implements SceneDownloadCoordinator {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SceneRepository sceneRepository

    FileSystemSceneDownloadCoordinator(SceneRepository sceneRepository) {
        this.sceneRepository = sceneRepository
    }

    void withScene(SceneRequest request, double sizeInBytes, Closure closure) {
        try {
            closure(new DefaultScene(request, sceneRepository))
        } catch (Exception e) {
            LOG.error("Failed to download scene $request", e)
        }
    }

}
