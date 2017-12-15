package org.openforis.sepal.component.hostingservice.local

import org.openforis.sepal.util.Config
import org.openforis.sepal.util.annotation.Data

@Data
class LocalConfig {
    final String host

    LocalConfig() {
        def c = new Config('local.properties')
        host = c.string('host')
    }
}
