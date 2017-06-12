package org.openforis.sepal.sql

import org.flywaydb.core.Flyway

class DatabaseMigration {
    private Flyway flyway

    DatabaseMigration(DatabaseConfig config) {
        flyway = new Flyway(
                locations: ["classpath:/sql/$config.schema"],
                dataSource: config.createRootDataSource(),
                schemas: [config.schema],
                validateOnMigrate: false
        )
    }

    void migrate() {
        flyway.repair()
        flyway.migrate()
    }
}
