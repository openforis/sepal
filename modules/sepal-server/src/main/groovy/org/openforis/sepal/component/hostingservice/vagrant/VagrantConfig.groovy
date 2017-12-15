package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.util.Config
import org.openforis.sepal.util.annotation.Data

@Data
class VagrantConfig {
    final String host

    VagrantConfig() {
        def c = new Config('vagrant.properties')
        host = c.string('host')
    }
}
