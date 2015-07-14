package org.openforis.sepal.scene.retrieval.provider

import org.openforis.sepal.scene.SceneProvider
import org.openforis.sepal.scene.SceneRequest

class DispatchingSceneProvider implements SceneProvider {
    private final List<SceneProvider> providers

    DispatchingSceneProvider(List<SceneProvider> providers) {
        this.providers = Collections.unmodifiableList(providers)
    }

    @Override
    List<SceneRequest> retrieve(List<SceneRequest> requests) {
        providers.inject(requests) { List<SceneRequest> toRetrieve, provider ->
            return toRetrieve ? provider.retrieve(toRetrieve) : toRetrieve
        }
        return null
    }

    @Override
    public void stop() {
        providers.each { provider -> provider.stop() }
    }
}
