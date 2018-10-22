package org.openforis.sepal.component.datasearch

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.util.Config

@Canonical
class DataSearchConfig {
    final String googleEarthEngineEndpoint
    final String googleMapsApiKey
    final String downloadWorkingDirectory

    DataSearchConfig() {
        def c = new Config('dataSearch.properties')
        googleEarthEngineEndpoint = c.googleEarthEngineEndpoint
        googleMapsApiKey = c.googleMapsApiKey
        downloadWorkingDirectory = c.downloadWorkingDirectory
    }
}
