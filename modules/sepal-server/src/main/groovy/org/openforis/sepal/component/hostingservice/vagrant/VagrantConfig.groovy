package org.openforis.sepal.component.hostingservice.vagrant

import groovy.transform.ToString
import org.openforis.sepal.component.hostingservice.internal.ConfigLoader

@ToString
class VagrantConfig {
    final String userHomeDirTemplate

    VagrantConfig(String propertiesFile) {
        def c = new ConfigLoader(propertiesFile)
        userHomeDirTemplate = c.get('userHomeDirTemplate')
    }
}
