package fake

import groovy.sql.BatchingPreparedStatementWrapper
import groovy.sql.Sql
import org.h2.jdbcx.JdbcDataSource
import org.openforis.sepal.component.dataprovider.management.RequestScenesDownloadCommand
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

    void addUser(String username) {
        sql.executeInsert("INSERT INTO users(username) values($username)")
    }

    void addUser(String username, int userUid) {
        sql.executeInsert("INSERT INTO users(username,user_uid) VALUES(?,?)", [username, userUid])
    }

    def addActiveDataSet(int dataSetId, int metadataProviderId = 1) {
        def dataSetName = "DataSet$dataSetId" as String
        sql.executeInsert("INSERT INTO data_set(id, dataset_name, dataset_value, dataset_active,metadata_provider) values($dataSetId, $dataSetName, $dataSetName, 1,$metadataProviderId)")
    }

    def addCrawlingCriteria(int providerId, String field, String expectedValue) {
        sql.executeInsert("INSERT INTO metadata_crawling_criteria(metadata_provider_id,field_name,expected_value) VALUES(?,?,?)", [providerId, field, expectedValue])
    }

    def addMetadataProvider(int providerId, String providerName, String crawlingEntrypoint = '', Boolean active = true) {
        sql.executeInsert("INSERT INTO metadata_providers(id,name,active,crawling_entrypoint) VALUES (?,?,?,?)", [providerId, providerName, active ? 1 : 0, crawlingEntrypoint])
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
