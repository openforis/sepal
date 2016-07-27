package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.hostingservice.internal.ConfigLoader
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.annotation.Data

@Data
class VagrantConfig {
    final String userHomeDirTemplate
    final String host

    VagrantConfig() {
        def c = new ConfigLoader(new File(FileSystem.configDir(), 'vagrant.properties'))
        userHomeDirTemplate = c.string('userHomeDirTemplate')
        host = c.string('host')
    }
}
