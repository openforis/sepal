package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.util.Config
import org.openforis.sepal.util.annotation.Data

@Data
class AwsConfig {
    final String region
    final String availabilityZone
    final String accessKey
    final String secretKey
    final int sepalVersion
    final String environment

    AwsConfig() {
        def c = new Config('aws.properties')
        region = c.string('region')
        availabilityZone = c.string('availabilityZone')
        accessKey = c.string('accessKey')
        secretKey = c.string('secretKey')
        sepalVersion = c.integer('sepalVersion')
        environment = c.string('environment')
    }
}
