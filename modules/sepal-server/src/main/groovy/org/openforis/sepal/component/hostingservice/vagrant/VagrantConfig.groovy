package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.util.Config
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.annotation.Data

@Data
class VagrantConfig {
    final String userHomeDirTemplate
    final String host

    VagrantConfig() {
        def c = new Config('vagrant.properties')
        userHomeDirTemplate = c.string('userHomeDirTemplate')
        host = c.string('host')
    }
}
