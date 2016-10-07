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
    static final String URL = "jdbc:h2:mem:sepal;MODE=MYSQL;DATABASE_TO_UPPER=FALSE;DB_CLOSE_DELAY=-1"

    private static boolean initialized
    private static DataSource dataSource

    Database() {
        initDatabase()
    }

    Database(String schema) {
        initDatabase(schema)
    }

    DataSource getDataSource() { dataSource }

    void reset() {
        long time = System.currentTimeMillis()
        def script = RESET_SCRIPT.getText('UTF-8')
        def rootDataSource = new JdbcDataSource(url: URL, user: 'sa', password: 'sa')
        new Sql(rootDataSource).execute(script)
        LOG.info("Reset database in ${System.currentTimeMillis() - time} millis.")
    }

    private Sql getSql() {
        new Sql(dataSource)
    }

    private synchronized void initDatabase(String schema = null) {
        def schemaParam = schema ? ";SCHEMA=$schema" : ""
        if (!initialized) {
            initialized = true
            long time = System.currentTimeMillis()
            setupSchema()
            dataSource = new JdbcDataSource(url: URL + schemaParam,
                    user: 'sa', password: 'sa')
            LOG.info("Setup database in ${System.currentTimeMillis() - time} millis.")
        } else reset()
    }

    private void setupSchema() {
        def script = SCHEMA.getText('UTF-8')
        def rootDataSource = new JdbcDataSource(url: URL, user: 'sa', password: 'sa')
        new Sql(rootDataSource).execute(script)
    }
}