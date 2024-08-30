package org.openforis.sepal.component.workerinstance

import groovy.transform.Canonical
import org.openforis.sepal.util.Config

@Canonical
class WorkerInstanceConfig {

    final String sepalVersion
    final String sepalUser
    final String sepalPassword
    final String sepalHost
    final String sepalHttpsPort
    final String sepalHostDataDir
    final String sepalHostProjectDir
    final String ldapPassword
    final int dockerPort
    final String dockerEntryPoint
    final String dockerRegistryHost
    final String googleProjectId
    final String googleRegion
    final String googleEarthEngineAccount
    final String googleEarthEnginePrivateKey
    final String rabbitMQHost
    final int rabbitMQPort
    final String deployEnvironment

    WorkerInstanceConfig() {
        def c = new Config('workerInstance.properties')
        sepalVersion = c.string('sepalVersion')
        sepalUser = c.string('sepalUser')
        sepalPassword = c.string('sepalPassword')
        sepalHost = c.string('sepalHost')
        sepalHttpsPort = c.string('sepalHttpsPort')
        sepalHostDataDir = c.string('sepalHostDataDir')
        sepalHostProjectDir = c.getProperty('sepalHostProjectDir')
        ldapPassword = c.string('ldapPassword')
        dockerPort = c.integer('dockerPort')
        dockerEntryPoint = c.string('dockerEntryPoint')
        dockerRegistryHost = c.string('dockerRegistryHost')
        googleProjectId = c.string('googleProjectId')
        googleRegion = c.string('googleRegion')
        googleEarthEngineAccount = c.string('googleEarthEngineAccount')
        googleEarthEnginePrivateKey = c.string('googleEarthEnginePrivateKey')
        rabbitMQHost = c.string('rabbitMQHost')
        rabbitMQPort = c.integer('rabbitMQPort')
        deployEnvironment = c.string('deployEnvironment')
    }

    static boolean isOlderVersion(String sepalVersion1, String sepalVersion2) {
        Comparator.comparingInt { it.find(/\d*/) as int }.compare(sepalVersion1, sepalVersion2) < 0
    }

}
