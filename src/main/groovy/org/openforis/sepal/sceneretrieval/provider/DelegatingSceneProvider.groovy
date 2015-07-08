package org.openforis.sepal.sceneretrieval.provider

class DelegatingSceneProvider implements SceneProvider {
    private final List<SceneProvider> providers

    DelegatingSceneProvider(List<SceneProvider> providers) {
        this.providers = Collections.unmodifiableList(providers)
    }

    Collection<SceneReference> retrieve(long requestId,String username, Collection<SceneReference> scenes) {
        providers.inject(scenes) { Collection<SceneReference> toRetrieve, provider ->
            return toRetrieve ? provider.retrieve(requestId,username, toRetrieve) : toRetrieve
        }
    }

    @Override
    public void stop() {
        providers.each { provider -> provider.stop() }
    }
}
