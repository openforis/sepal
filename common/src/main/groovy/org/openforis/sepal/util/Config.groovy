package org.openforis.sepal.util

final class Config {
    private final Properties config

    Config(String configFileName) {
        this(new File(FileSystem.configDir(), configFileName))
    }

    Config(File propertiesFile) {
        this(load(propertiesFile))
    }

    Config(Properties properties) {
        this.config = properties
    }

    final String getAt(String key) {
        string(key)
    }

    final String get(String key) {
        string(key)
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

    private static Properties load(File propertiesFile) {
        def properties = new Properties()
        properties.load(new FileReader(propertiesFile))
        return properties
    }
}
