package org.openforis.sepal.component.hostingservice.local

import groovy.transform.Canonical
import org.openforis.sepal.util.Config

@Canonical
class LocalConfig {

    final String host

    LocalConfig() {
        // host = System.getProperty('sepalHost')
        host = 'docker-api'
    }

}
