package fake

import groovy.sql.Sql
import org.h2.jdbcx.JdbcDataSource
import org.openforis.sepal.sql.DatabaseConfig
import org.openforis.sepal.sql.DatabaseMigration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.sql.DataSource
import java.sql.Connection
import java.util.concurrent.ConcurrentHashMap

class Database {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String URL = "jdbc:h2:mem:sepal;MODE=MYSQL;DATABASE_TO_UPPER=FALSE;DB_CLOSE_DELAY=-1"

    private final static Map<String, DataSource> DATA_SOURCE_BY_SCHEMA = new ConcurrentHashMap<>()

    private final String schema
    final DataSource dataSource

    Database() {
        this('sdms')
    }

    Database(String schema) {
        this.schema = schema
        if (DATA_SOURCE_BY_SCHEMA[schema]) {
            dataSource = DATA_SOURCE_BY_SCHEMA[schema]
            reset()
        }
        else {
            dataSource = createDataSource()
            DATA_SOURCE_BY_SCHEMA[schema] = dataSource
        }
    }

    private void reset() {
        long time = System.currentTimeMillis()

        def tables = new Sql(dataSource).rows("SHOW TABLES FROM $schema" as String)
                .collect { it.TABLE_NAME }
                .findAll { it != 'schema_version' }

        new Sql(dataSource).withTransaction { Connection connection ->
            def sql = new Sql(connection)
            sql.execute('SET REFERENTIAL_INTEGRITY FALSE')
            tables.each {
                try {
                    sql.execute("DELETE FROM $it" as String)
                } catch (Exception ignore) {
                }
            }
            sql.execute('SET REFERENTIAL_INTEGRITY TRUE')

        }
        LOG.info("Reset database in ${System.currentTimeMillis() - time} millis.")
    }

    private DataSource createDataSource() {
        long time = System.currentTimeMillis()
        def config = new DatabaseConfig(
                driver: JdbcDataSource.name,
                schema: schema,
                uri: "$URL;SCHEMA=$schema",
                user: 'sa',
                password: '',
                rootUri: URL,
                rootUser: 'sa',
                rootPassword: ''
        )
        new DatabaseMigration(config).migrate()
        def dataSource = config.createSchemaDataSource()
        LOG.info("Setup database in ${System.currentTimeMillis() - time} millis.")
        return dataSource
    }
}