package org.openforis.sepal.sceneretrieval.provider

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
