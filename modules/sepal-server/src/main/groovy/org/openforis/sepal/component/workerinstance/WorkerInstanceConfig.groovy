package org.openforis.sepal.component.workerinstance

import groovy.transform.ToString
import org.openforis.sepal.component.hostingservice.internal.ConfigLoader
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.annotation.Data
import org.openforis.sepal.workertype.WorkerType
import org.openforis.sepal.workertype.WorkerTypes

@Data
class WorkerInstanceConfig {
    int sepalVersion
    String sepalHost
    String ldapHost
    String ldapPassword
    File userHomes
    int dockerPort
    String dockerEntryPoint
    String dockerRegistryHost
    Map<String, WorkerType> workerTypeByName

    WorkerInstanceConfig() {
        def c = new ConfigLoader(new File(FileSystem.configDir(), 'workerInstance.properties'))
        sepalVersion = c.getInt('sepalVersion')
        sepalHost = c.get('sepalHost')
        ldapHost = c.get('ldapHost')
        ldapPassword = c.get('ldapPassword')
        userHomes = c.getFile('userHomes')
        dockerPort = c.getInt('dockerPort')
        dockerEntryPoint = c.get('dockerEntryPoint')
        dockerRegistryHost = c.get('dockerRegistryHost')
        this.workerTypeByName = new WorkerTypes().workerTypeByName()
    }
}
