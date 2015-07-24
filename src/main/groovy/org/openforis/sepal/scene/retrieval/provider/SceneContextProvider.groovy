package org.openforis.sepal.scene.retrieval.provider

import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.retrieval.SceneRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.scene.SceneStatus.*

interface SceneContextProvider {

    public void withScene(SceneRequest request, Closure closure)

    public void withScene(SceneRequest request, Double sizeInBytes, Closure closure)
}

class FileSystemSceneContextProvider implements SceneContextProvider {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    @Delegate
    @SuppressWarnings("GroovyUnusedDeclaration")
    private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()
    private final SceneRepository sceneRepository

    FileSystemSceneContextProvider(SceneRepository sceneRepository) {
        this.sceneRepository = sceneRepository
    }

    void withScene(SceneRequest request, Double sizeInBytes = null, Closure closure) {
        try {
            notifyListeners(request, DOWNLOADING)
            closure(new DefaultScene(request, sceneRepository))
            notifyListeners(request, DOWNLOADED)
        } catch (Exception e) {
            notifyListeners(request, FAILED)
            LOG.error("Failed to download scene $request", e)
        }
    }
}
