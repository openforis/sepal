package org.openforis.sepal.dataprovider

class DelegatingSceneProvider implements SceneProvider {
    private final List<SceneProvider> providers

    DelegatingSceneProvider(List<SceneProvider> providers) {
        this.providers = Collections.unmodifiableList(providers)
    }

    Collection<SceneReference> retrieve(long requestId, Collection<SceneReference> scenes) {
        providers.inject(scenes) { Collection<SceneReference> toRetrieve, provider ->
            return toRetrieve ? provider.retrieve(requestId, toRetrieve) : toRetrieve
        }
    }

    @Override
    public void stop() {
        providers.each { provider -> provider.stop() }
    }
}
