package org.openforis.sepal.database

import org.flywaydb.core.Flyway

class DatabaseMigration {
    private Flyway flyway

    DatabaseMigration(DatabaseConfig config) {
        flyway = new Flyway(
                locations: ["classpath:/sql/$config.schema"],
                dataSource: config.createRootDataSource(),
                schemas: [config.schema]
        )
    }

    void migrate() {
        flyway.migrate()
    }
}
