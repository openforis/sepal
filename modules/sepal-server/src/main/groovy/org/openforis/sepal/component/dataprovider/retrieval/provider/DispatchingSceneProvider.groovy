package org.openforis.sepal.component.dataprovider.retrieval.provider

import org.openforis.sepal.component.dataprovider.SceneProvider
import org.openforis.sepal.component.dataprovider.SceneRequest

import static org.openforis.sepal.component.dataprovider.Status.FAILED

class DispatchingSceneProvider implements SceneProvider {

    @Delegate
    @SuppressWarnings("GroovyUnusedDeclaration")
    private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()

    private final List<SceneProvider> providers

    DispatchingSceneProvider(List<SceneProvider> providers) {
        this.providers = Collections.unmodifiableList(providers)
    }

    Collection<SceneRequest> retrieve(List<SceneRequest> requests) {
        def requestsNotRetrieved = providers.inject(requests) { List<SceneRequest> toRetrieve, provider ->
            return toRetrieve ? provider.retrieve(toRetrieve) : toRetrieve
        }
        requestsNotRetrieved.each { notifyListeners(it as SceneRequest, FAILED) }
        return []
    }

    @Override
    public void stop() {
        providers.each { provider -> provider.stop() }
    }
}
