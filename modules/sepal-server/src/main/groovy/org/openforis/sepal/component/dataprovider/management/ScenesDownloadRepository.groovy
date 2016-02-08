package org.openforis.sepal.component.dataprovider.management

import groovy.sql.BatchingPreparedStatementWrapper as BatchPs
import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.component.dataprovider.*
import org.openforis.sepal.transaction.SqlConnectionProvider

import java.sql.Timestamp

interface ScenesDownloadRepository extends SceneRetrievalListener, DownloadRequestListener {

    void saveDownloadRequest(RequestScenesDownloadCommand requestScenesDownload)

    List<DownloadRequest> getNewDownloadRequests()

    int updateSceneStatus(long sceneId, Status status)

    int updateRequestStatus(long id, Status status)

    Boolean hasStatus(long requestId, Status status)

    Boolean requestNameExist(String userName, String requestName)

    List<DownloadRequest> findUserRequests(String username)

    void deleteRequest(int requestId)

    void deleteScene(int requestId, int sceneId)


    void reloadRequestData(DownloadRequest request)

}

class JdbcScenesDownloadRepository implements ScenesDownloadRepository {
    private final SqlConnectionProvider connectionProvider

    JdbcScenesDownloadRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }


    void sceneStatusChanged(SceneRequest sceneRequest, Status status) {
        this.updateSceneStatus(sceneRequest.id, status)
    }

    @Override
    void requestStatusChanged(DownloadRequest request, Status status) {
        this.updateRequestStatus(request.requestId, status)
    }

    @Override
    Boolean hasStatus(long requestId, Status status) {
        GroovyRowResult row = sql.firstRow('''
            SELECT COUNT(*) AS counter
            FROM requested_scenes rs
            WHERE rs.request_id = ?
            AND LOWER(rs.status) <> ?''', [requestId, status.name().toLowerCase()])
        return row?.counter == 0
    }

    @Override
    Boolean requestNameExist(String userName, String requestName) {
        GroovyRowResult row = sql.firstRow('''
           SELECT COUNT(*) AS counter
           FROM download_requests dr
           WHERE username = ? AND lower(request_name) = ?''', [userName, requestName?.toLowerCase()])
        return row?.counter > 0
    }

    @Override
    void saveDownloadRequest(RequestScenesDownloadCommand requestScenesDownload) {
        def generated = sql.executeInsert('INSERT INTO download_requests(username,group_scenes,request_name) VALUES(?,?,?)', [requestScenesDownload.username, requestScenesDownload.groupScenes, requestScenesDownload.requestName])
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
    List<DownloadRequest> getNewDownloadRequests() {
        List<DownloadRequest> requests = []
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.request_id
                WHERE dr.request_status = ?
                ORDER BY dr.request_time DESC''', [Status.REQUESTED.name()]) {
            map(requests, it)
        }
        return requests
    }

    @Override
    void reloadRequestData(DownloadRequest request) {
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.request_id
                WHERE dr.request_id = ?''', [request.requestId]) {
            map(request, it)
        }
    }

    int updateSceneStatus(long id, Status status) {
        def now = new Timestamp(Calendar.getInstance().getTime().getTime())
        def query = "UPDATE requested_scenes  SET last_updated = ?, status = ? WHERE id = ?"
        sql.executeUpdate(query, [now, status.name(), id])
    }

    int updateRequestStatus(long id, Status status) {
        sql.executeUpdate("UPDATE download_requests  SET request_status = ? WHERE request_id = ?", [status.name(), id])
    }

    List<DownloadRequest> findUserRequests(String username) {
        List<DownloadRequest> downloadRequests = []
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

    static def map(List<DownloadRequest> downloadRequests, row) {
        int requestId = row.request_id
        def downloadRequest = new DownloadRequest(requestId: requestId)
        def alreadyMappedOne = downloadRequests.find { it.requestId == requestId }
        downloadRequest = alreadyMappedOne ? alreadyMappedOne : downloadRequest
        map(downloadRequest, row)
        if (!(alreadyMappedOne)) {
            downloadRequests.add(downloadRequest)
        }
    }


    static def map(DownloadRequest downloadRequest, row) {
        downloadRequest.requestId = row.request_id
        downloadRequest.username = row.username
        downloadRequest.requestTime = row.request_time
        downloadRequest.groupScenes = row.group_scenes
        downloadRequest.requestName = row.request_name
        downloadRequest.status = row.request_status
        downloadRequest.processingChain = row.processing_chain

        def dataSet = DataSet.byId(row.dataset_id)
        downloadRequest.dataSet = dataSet
        def scene = new SceneRequest(row.id as long,
                new SceneReference(row.scene_id, dataSet),
                row.processing_chain as String,
                row.last_updated as Date,
                Status.byValue(row.status as String), downloadRequest)
        DownloadRequest downloadRequestReference = downloadRequest.clone() as DownloadRequest
        downloadRequestReference.scenes = []
        scene.request = downloadRequestReference
        downloadRequest.scenes.add(scene)
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
