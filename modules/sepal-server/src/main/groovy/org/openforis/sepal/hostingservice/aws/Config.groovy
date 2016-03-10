package org.openforis.sepal.hostingservice.aws

import groovy.transform.ToString

@ToString
class Config {
    String region
    String availabilityZone
    String accessKey
    String secretKey
    String sepalVersion
    String environment

    Config(String propertiesFile) {
        def properties = new Properties()
        properties.load(new FileReader(new File(propertiesFile)))
        region = get('region', properties)
        availabilityZone = get('availabilityZone', properties)
        accessKey = get('accessKey', properties)
        secretKey = get('secretKey', properties)
        sepalVersion = get('sepalVersion', properties)
        environment = get('environment', properties)
    }

    private static String get(String key, Properties properties) {
        def value = properties.getProperty(key)
        if (value == null)
            throw new MissingProperty("missing required property: $key")
        return value
    }

    static class MissingProperty extends RuntimeException {
        MissingProperty(String message) {
            super(message)
        }
    }
}
