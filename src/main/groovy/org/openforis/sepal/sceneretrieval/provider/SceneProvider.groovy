package org.openforis.sepal.sceneretrieval.provider

interface SceneProvider {
    /**
     * Request provider scenes to be retrieved asynchronously. Scenes the provider is unable to retrieve are returned.
     * @param scenes the scenes to retrieve
     * @return scenes not retrievable for this provider
     */
    Collection<SceneReference> retrieve(long requestId,String username, Collection<SceneReference> scenes)

    void stop()
}