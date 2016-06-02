package org.openforis.sepal.component.hostingservice.internal

final class ConfigLoader {
    private final Properties config

    ConfigLoader(String propertiesFile) {
        config = new Properties()
        config.load(new FileReader(new File(propertiesFile)))
    }

    final String get(String key) {
        def value = config.getProperty(key)
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
