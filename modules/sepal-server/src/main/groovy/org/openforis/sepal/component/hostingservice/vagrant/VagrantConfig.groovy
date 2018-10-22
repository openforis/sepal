package org.openforis.sepal.component.hostingservice.vagrant

import groovy.transform.Canonical
import org.openforis.sepal.util.Config

@Canonical
class VagrantConfig {
    final String host

    VagrantConfig() {
        def c = new Config('vagrant.properties')
        host = c.string('host')
    }
}
