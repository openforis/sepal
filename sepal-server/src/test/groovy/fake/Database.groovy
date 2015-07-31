package fake

import groovy.sql.BatchingPreparedStatementWrapper
import groovy.sql.Sql
import org.h2.jdbcx.JdbcDataSource
import org.openforis.sepal.scene.management.RequestScenesDownloadCommand
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.sql.DataSource

class Database {
    private static final Logger LOG = LoggerFactory.getLogger(this.class)
    private static final File SCHEMA = new File('src/main/db', 'schema_dev.sql')
    private static final File RESET_SCRIPT = new File('src/main/db', 'reset.sql')
    static final String URL = "jdbc:h2:mem:sepal;MODE=MYSQL;DB_CLOSE_DELAY=-1"

    private static boolean initialized
    private static DataSource dataSource

    Database() {
        initDatabase()
    }

    DataSource getDataSource() { dataSource }

    void addUser(String username) {
        sql.executeInsert("INSERT INTO users(username) values($username)")
    }

    def addActiveDataSet(int dataSetId) {
        def dataSetName = "DataSet$dataSetId" as String
        sql.executeInsert("INSERT INTO data_set(id, dataset_name, dataset_value, dataset_active) values($dataSetId, $dataSetName, $dataSetName, 1)")
    }

    def addDownloadRequest(RequestScenesDownloadCommand downloadRequest) {
        def generated = sql.executeInsert('INSERT INTO download_requests(username) VALUES(?)', [downloadRequest.username])
        def requestId = generated[0][0] as int
        sql.withBatch('INSERT INTO requested_scenes(request_id, scene_id,dataset_id,processing_chain) VALUES(?, ?,?,?)') { BatchingPreparedStatementWrapper ps ->
            downloadRequest.sceneIds.each {
                ps.addBatch([requestId, it, downloadRequest.dataSetId, downloadRequest.processingChain])
            }
        }
    }

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
            setupSchema()
            LOG.info("Setup database in ${System.currentTimeMillis() - time} millis.")
        } else reset()
    }

    private void setupSchema() {
        def schema = SCHEMA.getText('UTF-8')
        new Sql(dataSource).execute(schema)
    }
}
