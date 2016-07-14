package fake

import groovy.sql.Sql
import org.h2.jdbcx.JdbcDataSource
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.sql.DataSource

class Database {
    private static final Logger LOG = LoggerFactory.getLogger(this.class)
    private static final File SCHEMA = new File('src/test/resources/db', 'schema.sql')
    private static final File RESET_SCRIPT = new File('src/test/resources/db', 'schema.sql')
    static final String URL = "jdbc:h2:mem:sepal;MODE=MYSQL;DB_CLOSE_DELAY=-1"

    private static boolean initialized
    private static DataSource dataSource

    Database() {
        initDatabase()
    }

    DataSource getDataSource() { dataSource }

    void reset() {
        long time = System.currentTimeMillis()
        def resetScript = RESET_SCRIPT.getText('UTF-8')
        new Sql(dataSource).execute(resetScript)
        LOG.info("Reset database in ${System.currentTimeMillis() - time} millis.")
    }

    private Sql getSql() {
        new Sql(dataSource)
    }

    private synchronized void initDatabase() {
        if (!initialized) {
            initialized = true
            long time = System.currentTimeMillis()
            dataSource = new JdbcDataSource(url: URL,
                    user: 'sa', password: 'sa')
            sql.execute('''
                CREATE ALIAS IF NOT EXISTS SPATIAL_INIT FOR
                    "org.h2gis.h2spatialext.CreateSpatialExtension.initSpatialExtension";
                CALL SPATIAL_INIT();''')
            setupSchema()
            LOG.info("Setup database in ${System.currentTimeMillis() - time} millis.")
        } else reset()
    }

    private void setupSchema() {
        def schema = SCHEMA.getText('UTF-8')
        new Sql(dataSource).execute(schema)
    }
}