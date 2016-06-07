package org.openforis.sepal.component.workerinstance

import groovy.transform.ToString
import org.openforis.sepal.component.hostingservice.internal.ConfigLoader
import org.openforis.sepal.workertype.WorkerType

@ToString
class WorkerInstanceConfig {
    int sepalVersion
    String sepalHost
    String ldapHost
    String ldapPassword
    File userHomes
    int dockerPort
    String dockerEntrypoint
    Map<String, WorkerType> workerTypeByName

    WorkerInstanceConfig(String propertiesFile, Map<String, WorkerType> workerTypeByName) {
        def c = new ConfigLoader(propertiesFile)
        sepalVersion = c.getInt('sepalVersion')
        sepalHost = c.get('sepalHost')
        ldapHost = c.get('ldapHost')
        ldapPassword = c.get('ldapPassword')
        dockerPort = c.getInt('dockerPort')
        dockerEntrypoint = c.get('dockerEntrypoint')
        this.workerTypeByName = workerTypeByName
    }
}
