package org.openforis.sepal.component.datasearch

import org.openforis.sepal.util.Config
import org.openforis.sepal.util.annotation.Data

@Data
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
