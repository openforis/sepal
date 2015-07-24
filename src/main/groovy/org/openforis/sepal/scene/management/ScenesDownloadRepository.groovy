package org.openforis.sepal.scene.management

import groovy.sql.BatchingPreparedStatementWrapper as BatchPs
import groovy.sql.Sql
import org.openforis.sepal.scene.*
import org.openforis.sepal.transaction.SqlConnectionProvider

import java.sql.Timestamp

interface ScenesDownloadRepository extends SceneRetrievalListener {

    void saveDownloadRequest(RequestScenesDownloadCommand requestScenesDownload)

    List<SceneRequest> getNewDownloadRequests()

    int updateSceneStatus(long requestId, String sceneId, SceneStatus status)

    List<Map> findUserRequests(String username)

    void deleteRequest(int requestId)

    void deleteScene(int requestId, int sceneId)

}

class JdbcScenesDownloadRepository implements ScenesDownloadRepository {
    private final SqlConnectionProvider connectionProvider

    JdbcScenesDownloadRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }


    void sceneStatusChanged(SceneRequest request, SceneStatus status) {
        this.updateSceneStatus(request.id, request.sceneReference.id, status)
    }

    @Override
    void saveDownloadRequest(RequestScenesDownloadCommand requestScenesDownload) {
        def generated = sql.executeInsert('INSERT INTO download_requests(username) VALUES(?)', [requestScenesDownload.username])
        def requestId = generated[0][0] as int
        sql.withBatch('''
                INSERT INTO requested_scenes(request_id, scene_id, dataset_id, processing_chain)
                VALUES(?, ?, ?, ?)''') { BatchPs ps ->
            requestScenesDownload.sceneIds.each {
                ps.addBatch([requestId, it, requestScenesDownload.dataSetId, requestScenesDownload.processingChain])
            }
        }
    }

    @Override
    List<SceneRequest> getNewDownloadRequests() {
        List<SceneRequest> requests = new ArrayList<SceneRequest>()
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.request_id
                WHERE rs.status = ?
                ORDER BY dr.request_time DESC''', [SceneStatus.REQUESTED.name()]) {
            requests.add(mapSceneRequest(it))
        }
        return requests
    }

    int updateSceneStatus(long requestId, String sceneId, SceneStatus status) {
        def now = new Timestamp(Calendar.getInstance().getTime().getTime())
        def query = "UPDATE requested_scenes  SET last_updated = ?, status = ? WHERE request_id = ? and scene_id = ?"
        sql.executeUpdate(query, [now, status.name(), requestId, sceneId])
    }

    List<Map> findUserRequests(String username) {
        List<Map> downloadRequests = []
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.request_id
                WHERE dr.username = ?
                ORDER BY dr.request_time DESC''', [username]) {
            map(downloadRequests, it)
        }
        return downloadRequests
    }

    @Override
    void deleteRequest(int requestId) {
        def sqlScenes = " DELETE FROM requested_scenes WHERE request_id = ?"
        def sqlRequest = "DELETE FROM download_requests WHERE request_id = ?"
        sql.withTransaction {
            sql.execute(sqlScenes, [requestId])
            sql.execute(sqlRequest, [requestId])
        }
    }

    @Override
    void deleteScene(int requestId, int sceneId) {
        def sqlScenes = " DELETE FROM requested_scenes WHERE request_id = ? AND id = ?"
        sql.execute(sqlScenes, [requestId, sceneId])
    }

    def map(List<Map> downloadRequests, row) {
        int requestId = row.request_id
        def downloadRequest = [
                requestId: requestId,
                scenes   : []
        ]
        def alreadyMappedOne = downloadRequests.find { it.requestId == requestId }
        downloadRequest = alreadyMappedOne ? alreadyMappedOne : downloadRequest
        map(downloadRequest, row)
        if (!(alreadyMappedOne)) {
            downloadRequests.add(downloadRequest)
        }
    }

    private SceneRequest mapSceneRequest(row) {
        int requestId = row.request_id
        String userName = row.username
        String sceneId = row.scene_id
        def dataSet = DataSet.byId(row.dataset_id as int)
        String processingChain = row.processing_chain
        return new SceneRequest(requestId, new SceneReference(sceneId, dataSet), processingChain, userName)

    }

    def map(Map downloadRequest, row) {
        downloadRequest.requestId = row.request_id
        downloadRequest.username = row.username
        downloadRequest.requestTime = row.request_time
        Map scene = [:]
        scene.id = row.id
        scene.requestId = row.request_id
        scene.sceneId = row.scene_id
        scene.processingChain = row.processing_chain
        scene.dataSet = DataSet.byId(row.dataset_id as int)
        scene.lastUpdated = row.last_updated
        scene.status = SceneStatus.byValue(row.status as String)
        downloadRequest.scenes.add(scene)
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
