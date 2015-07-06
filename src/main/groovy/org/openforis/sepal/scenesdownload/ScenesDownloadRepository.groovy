package org.openforis.sepal.scenesdownload

import groovy.sql.BatchingPreparedStatementWrapper as BatchPs
import groovy.sql.Sql
import org.openforis.sepal.scenesdownload.DownloadRequest.RequestStatus
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class ScenesDownloadRepository {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SqlConnectionProvider connectionProvider

    ScenesDownloadRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    void saveDownloadRequest(RequestScenesDownload requestScenesDownload) {
        def generated = sql.executeInsert('INSERT INTO download_requests(user_id, processing_chain, data_set_id) VALUES(?, ?, ?)',
                [requestScenesDownload.userId, requestScenesDownload.processingChain, requestScenesDownload.dataSetId])
        def requestId = generated[0][0] as int
        sql.withBatch('INSERT INTO requested_scenes(download_request_id, scene_id) VALUES(?, ?)') { BatchPs ps ->
            requestScenesDownload.sceneIds.each {
                ps.addBatch([requestId, it])
            }
        }
    }

    List<DownloadRequest> getNewDownloadRequests() {
        List<DownloadRequest> requests = new ArrayList<DownloadRequest>()
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.download_request_id
                WHERE dr.request_status = 'REQUESTED'
                ORDER BY dr.request_time DESC''') {
            map(requests, it)
        }
        return requests
    }

    int updateDownloadStatus(long requestId, RequestStatus status, String response = "", boolean markAsCompleted = false) {
        def query = markAsCompleted ?
                'UPDATE download_requests SET response = ?, request_status = ?, end_time = CURRENT_TIMESTAMP WHERE request_id = ?' :
                'UPDATE download_requests SET response = ?, request_status = ?  WHERE request_id = ?'
        sql.executeUpdate(query, [response, status.toString(), requestId])
    }

    List<DownloadRequest> findRequests(int userId) {
        List<DownloadRequest> downloadRequests = []
        sql.eachRow('''
                SELECT *
                FROM download_requests dr
                JOIN requested_scenes rs
                ON dr.request_id = rs.download_request_id
                WHERE dr.user_id = ?
                ORDER BY dr.request_time DESC''', [userId]) {
            map(downloadRequests, it)
        }
        return downloadRequests
    }

    def map(List<DownloadRequest> downloadRequests, row) {
        int requestId = row.request_id
        DownloadRequest downloadRequest = new DownloadRequest(requestId)
        DownloadRequest alreadyMappedOne = downloadRequests.find { it.requestId == requestId }
        downloadRequest = alreadyMappedOne ? alreadyMappedOne : downloadRequest
        if (!alreadyMappedOne) {
            downloadRequest.requestor = row.user_id
            downloadRequest.requestTime = row.request_time
            downloadRequest.completionTime = row.end_time
            downloadRequest.response = row.response
            downloadRequest.dataSetId = row.data_set_id
            downloadRequest.processingChain = row.processing_chain
            downloadRequest.requestStatus = RequestStatus.byValue(row.request_status)
            downloadRequests.add(downloadRequest)
        }

        RequestedScene scene = new RequestedScene()
        scene.sceneRequestId = row.scene_request_id
        scene.downloadRequestId = requestId
        scene.sceneId = row.scene_id
        downloadRequest.scenes.add(scene)
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
