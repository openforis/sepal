package org.openforis.sepal.component.hostingservice.vagrant

import groovy.transform.ToString
import org.openforis.sepal.component.hostingservice.internal.ConfigLoader
import org.openforis.sepal.util.FileSystem

@ToString
class VagrantConfig {
    final String userHomeDirTemplate

    VagrantConfig() {
        def c = new ConfigLoader(new File(FileSystem.configDir(), 'vagrant.properties'))
        userHomeDirTemplate = c.get('userHomeDirTemplate')
    }
}
