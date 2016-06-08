package org.openforis.sepal.component.hostingservice.aws

import groovy.transform.ToString
import org.openforis.sepal.component.hostingservice.internal.ConfigLoader
import org.openforis.sepal.util.FileSystem

@ToString
class AwsConfig {
    final String region
    final String availabilityZone
    final String accessKey
    final String secretKey
    final int sepalVersion
    final String environment
    final String userHomeDirTemplate

    AwsConfig() {
        def c = new ConfigLoader(new File(FileSystem.configDir(), 'aws.properties'))
        region = c.get('region')
        availabilityZone = c.get('availabilityZone')
        accessKey = c.get('accessKey')
        secretKey = c.get('secretKey')
        sepalVersion = c.getInt('sepalVersion')
        environment = c.get('environment')
        userHomeDirTemplate = c.get('userHomeDirTemplate')
    }
}
