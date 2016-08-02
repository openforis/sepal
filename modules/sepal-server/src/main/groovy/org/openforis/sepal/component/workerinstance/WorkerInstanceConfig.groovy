package org.openforis.sepal.component.workerinstance

import org.openforis.sepal.component.hostingservice.internal.ConfigLoader
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.annotation.Data
import org.openforis.sepal.workertype.WorkerType
import org.openforis.sepal.workertype.WorkerTypes

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
        def c = new ConfigLoader(new File(FileSystem.configDir(), 'workerInstance.properties'))
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
