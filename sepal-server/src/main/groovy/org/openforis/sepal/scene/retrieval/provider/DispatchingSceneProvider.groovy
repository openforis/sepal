package org.openforis.sepal.scene.retrieval.provider

import org.openforis.sepal.scene.SceneProvider
import org.openforis.sepal.scene.SceneRequest

import static org.openforis.sepal.scene.SceneStatus.FAILED

class DispatchingSceneProvider implements SceneProvider {
    @Delegate
    @SuppressWarnings("GroovyUnusedDeclaration")
    private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()
    private final List<SceneProvider> providers

    DispatchingSceneProvider(List<SceneProvider> providers) {
        this.providers = Collections.unmodifiableList(providers)
    }

    List<SceneRequest> retrieve(List<SceneRequest> requests) {
        def requestsNotRetrieved = providers.inject(requests) { List<SceneRequest> toRetrieve, provider ->
            return toRetrieve ? provider.retrieve(toRetrieve) : toRetrieve
        }
        requestsNotRetrieved.each { notifyListeners(it, FAILED) }
        return []
    }

    @Override
    public void stop() {
        providers.each { provider -> provider.stop() }
    }
}
