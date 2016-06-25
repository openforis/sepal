package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.hostingservice.internal.ConfigLoader
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.annotation.Data

@Data
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
        region = c.string('region')
        availabilityZone = c.string('availabilityZone')
        accessKey = c.string('accessKey')
        secretKey = c.string('secretKey')
        sepalVersion = c.integer('sepalVersion')
        environment = c.string('environment')
        userHomeDirTemplate = c.string('userHomeDirTemplate')
    }
}
