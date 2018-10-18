package org.openforis.sepal.sql

import com.mchange.v2.c3p0.ComboPooledDataSource
import groovy.transform.Immutable
import org.openforis.sepal.util.Config

import javax.sql.DataSource

@Immutable
class DatabaseConfig {
    String driver
    String schema
    String uri
    String user
    String password
    String rootUri
    String rootUser
    String rootPassword

    static DatabaseConfig fromPropertiesFile(String schema) {
        def c = new Config('database.properties')
        return new DatabaseConfig(
                schema: schema ?: c.schema,
                driver: c.driver,
                uri: c.uri.toString().replaceAll(/\{schema}/, schema),
                user: c.user,
                password: c.password,
                rootUri: c.rootUri,
                rootUser: c.rootUser,
                rootPassword: c.rootPassword
        )
    }

    DataSource createRootDataSource() {
        new ComboPooledDataSource(
                driverClass: driver,
                jdbcUrl: rootUri,
                user: rootUser,
                password: rootPassword,
                testConnectionOnCheckout: true
        )
    }

    DataSource createSchemaDataSource() {
        new ComboPooledDataSource(
                driverClass: driver,
                jdbcUrl: uri,
                user: rootUser,
                password: rootPassword,
                testConnectionOnCheckout: true
        )
    }
}
