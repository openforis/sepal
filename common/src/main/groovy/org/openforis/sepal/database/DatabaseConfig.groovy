package org.openforis.sepal.database

import com.mchange.v2.c3p0.ComboPooledDataSource
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.annotation.Data

import javax.sql.DataSource

@Data
class DatabaseConfig {
    private final String driver
    final String schema
    private final String uri
    private final String user
    private final String password
    private final String rootUri
    private final String rootUser
    private final String rootPassword

    DatabaseConfig() {
        def c = new Config('database.properties')
        driver = c.driver
        schema = c.schema
        uri = c.uri
        user = c.user
        password = c.password
        rootUri = c.rootUri
        rootUser = c.rootUser
        rootPassword = c.rootPassword
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

    DataSource createConnectionPool() {
        new ComboPooledDataSource(
                driverClass: driver,
                jdbcUrl: uri,
                user: rootUser,
                password: rootPassword,
                testConnectionOnCheckout: true
        )
    }
}
