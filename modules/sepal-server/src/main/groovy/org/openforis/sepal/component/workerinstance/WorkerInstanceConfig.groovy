package org.openforis.sepal.component.workerinstance

import org.openforis.sepal.util.Config
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.annotation.Data

@Data
class WorkerInstanceConfig {
    int sepalVersion
    String sepalUser
    String sepalPassword
    String sepalHost
    String ldapHost
    String ldapPassword
    File userHomes
    int dockerPort
    String dockerEntryPoint
    String dockerRegistryHost
    String googleEarthEngineAccount
    String googleEarthEnginePrivateKey

    WorkerInstanceConfig() {
        def c = new Config('workerInstance.properties')
        sepalVersion = c.integer('sepalVersion')
        sepalUser = c.string('sepalUser')
        sepalPassword = c.string('sepalPassword')
        sepalHost = c.string('sepalHost')
        ldapHost = c.string('ldapHost')
        ldapPassword = c.string('ldapPassword')
        userHomes = c.file('userHomes')
        dockerPort = c.integer('dockerPort')
        dockerEntryPoint = c.string('dockerEntryPoint')
        dockerRegistryHost = c.string('dockerRegistryHost')
        googleEarthEngineAccount = c.string('googleEarthEngineAccount')
        googleEarthEnginePrivateKey = c.string('googleEarthEnginePrivateKey')
    }
}
