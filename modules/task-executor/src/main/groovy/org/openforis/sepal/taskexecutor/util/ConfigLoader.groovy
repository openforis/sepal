package org.openforis.sepal.taskexecutor.util

final class ConfigLoader {
    private final Properties config

    ConfigLoader(File propertiesFile) {
        config = new Properties()
        config.load(new FileReader(propertiesFile))
    }

    final String string(String key) {
        def value = config.getProperty(key)
        if (value == null)
            throw new MissingProperty("missing required property: $key")
        return value
    }

    final File file(String key) {
        return new File(string(key))
    }

    final int integer(String key) {
        def value = string(key)
        try {
            return value as int
        } catch (Exception ignore) {
            throw new InvalidConfig("Expected $key to be an int: $value")
        }
    }

    final URI uri(String key) {
        def value = string(key)
        try {
            return URI.create(value)
        } catch (Exception ignore) {
            throw new InvalidConfig("Expected $key to be a URI: $value")
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

