package org.openforis.sepal.component.hostingservice.local

import groovy.transform.Canonical
import org.openforis.sepal.util.Config

@Canonical
class LocalConfig {
    final String host

    LocalConfig() {
        def c = new Config('local.properties')
        host = c.string('host')
    }
}
