package org.openforis.sepal.component.hostingservice.internal

final class ConfigLoader {
    private final Properties config

    ConfigLoader(File propertiesFile) {
        config = new Properties()
        config.load(new FileReader(propertiesFile))
    }

    final String get(String key) {
        def value = config.getProperty(key)
        if (value == null)
            throw new MissingProperty("missing required property: $key")
        return value
    }

    final File getFile(String key) {
        return new File(get(key))
    }

    final int getInt(String key) {
        def value = get(key)
        try {
            return value as int
        } catch (Exception ignore) {
            throw new InvalidConfig("Expected $key to be an int: $value")
        }
    }

    static class MissingProperty extends RuntimeException {
        MissingProperty(String message) {
            super(message)
        }
    }

    static class InvalidConfig extends RuntimeException {
        InvalidConfig(String message) {
            super(message)
        }
    }
}
