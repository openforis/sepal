package org.openforis.sepal.component.hostingservice.gcp

import groovy.transform.Canonical
import org.openforis.sepal.util.Config

@Canonical
class GcpConfig {
    final String region
    final String availabilityZone
    final String accessKey
    final String secretKey
    final String syslogAddress
    final String sepalVersion
    final String environment

    GcpConfig() {
        def c = new Config('aws.properties')
        region = c.string('region')
        availabilityZone = c.string('availabilityZone')
        accessKey = c.string('accessKey')
        secretKey = c.string('secretKey')
        syslogAddress = c.string('syslogAddress')
        sepalVersion = c.string('sepalVersion')
        environment = c.string('environment')
    }
}
