package org.openforis.sepal.scenesdownload

import groovy.sql.BatchingPreparedStatementWrapper as BatchPs
import groovy.sql.Sql
import org.openforis.sepal.sceneretrieval.provider.DataSet
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.sceneretrieval.SceneRetrievalListener
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface ScenesDownloadRepository extends SceneRetrievalListener{

    void saveDownloadRequest(RequestScenesDownload requestScenesDownload)

    List<DownloadRequest> getNewDownloadRequests()

    int updateSceneStatus(long requestId,String sceneId, DownloadRequest.SceneStatus status)

    List<DownloadRequest> findUserRequests(String username)

    DownloadRequest getById(long requestId)

}

class JdbcScenesDownloadRepository implements ScenesDownloadRepository{
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SqlConnectionProvider connectionProvider

    JdbcScenesDownloadRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    @Override
    void sceneStatusChanged(SceneRequest request, DownloadRequest.SceneStatus status) {
        this.updateSceneStatus(request.id,request.sceneReference.id,status)
    }

    @Override
    DownloadRequest getById(long requestId) {
        DownloadRequest request = new DownloadRequest()
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.request_id
                WHERE dr.request_id = ?
                ORDER BY dr.request_time DESC''',[requestId]) {
            map(request, it)
        }
        if (! (request.scenes)){
            throw new IllegalArgumentException("request $requestId not found or invalid")
        }
        return request
    }

    @Override
    void saveDownloadRequest(RequestScenesDownload requestScenesDownload) {
        def generated = sql.executeInsert('INSERT INTO download_requests(username) VALUES(?)',[requestScenesDownload.username])
        def requestId = generated[0][0] as int
        sql.withBatch('INSERT INTO requested_scenes(request_id, scene_id,dataset_id,processing_chain) VALUES(?, ?,?,?)') { BatchPs ps ->
            requestScenesDownload.sceneIds.each {
                ps.addBatch([requestId, it,requestScenesDownload.dataSetId,requestScenesDownload.processingChain])
            }
        }
    }

    @Override
    List<DownloadRequest> getNewDownloadRequests() {
        List<DownloadRequest> requests = new ArrayList<DownloadRequest>()
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.request_id
                WHERE rs.status = ?
                ORDER BY dr.request_time DESC''',[DownloadRequest.SceneStatus.REQUESTED.name()]) {
            map(requests, it)
        }
        return requests
    }

    int updateSceneStatus(long requestId,String sceneId, DownloadRequest.SceneStatus status) {
        def query = 'UPDATE requested_scenes  SET last_updated = ?, status = ?  WHERE request_id = ? and scene_id = ?'
        sql.executeUpdate(query, [new java.sql.Timestamp(Calendar.getInstance().getTime().getTime()), status.toString(), requestId,sceneId])
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

     def map(List<DownloadRequest> downloadRequests, row) {
        int requestId = row.request_id
        DownloadRequest downloadRequest = new DownloadRequest(requestId)
        DownloadRequest alreadyMappedOne = downloadRequests.find { it.requestId == requestId }
        downloadRequest = alreadyMappedOne ? alreadyMappedOne : downloadRequest
        map(downloadRequest,row)
        if (! (alreadyMappedOne)){
            downloadRequests.add(downloadRequest)
        }
    }

    def map(DownloadRequest downloadRequest,row){
        downloadRequest.requestId = row.request_id
        downloadRequest.username = row.username
        downloadRequest.requestTime = row.request_time
        RequestedScene scene = new RequestedScene()
        scene.id = row.request_id
        scene.requestId = row.request_id
        scene.sceneId = row.scene_id
        scene.processingChain = row.processing_chain
        scene.dataSet = DataSet.byId(row.dataset_id as int)
        scene.lastUpdated = row.last_updated
        scene.status = DownloadRequest.SceneStatus.byValue(row.status)
        downloadRequest.scenes.add(scene)
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
