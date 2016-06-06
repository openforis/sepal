package org.openforis.sepal.component.hostingservice.aws

import groovy.transform.ToString
import org.openforis.sepal.component.hostingservice.internal.ConfigLoader

@ToString
class AwsConfig {
    final String region
    final String availabilityZone
    final String accessKey
    final String secretKey
    final int sepalVersion
    final String environment
    final String userHomeDirTemplate

    AwsConfig(String propertiesFile) {
        def c = new ConfigLoader(propertiesFile)
        region = c.get('region')
        availabilityZone = c.get('availabilityZone')
        accessKey = c.get('accessKey')
        secretKey = c.get('secretKey')
        sepalVersion = c.getInt('sepalVersion')
        environment = c.get('environment')
        userHomeDirTemplate = c.get('userHomeDirTemplate')
    }
}
