package org.openforis.sepal.component.hostingservice.aws

import groovy.transform.Canonical
import org.openforis.sepal.util.Config

@Canonical
class AwsConfig {
    final String region
    final String availabilityZone
    final String accessKey
    final String secretKey
    final String sepalVersion
    final String environment

    AwsConfig() {
        def c = new Config('aws.properties')
        region = c.string('region')
        availabilityZone = c.string('availabilityZone')
        accessKey = c.string('accessKey')
        secretKey = c.string('secretKey')
        sepalVersion = c.string('sepalVersion')
        environment = c.string('environment')
    }
}
