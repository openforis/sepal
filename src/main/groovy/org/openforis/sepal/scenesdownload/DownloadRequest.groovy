package org.openforis.sepal.scenesdownload

import groovy.transform.ToString

@ToString
class DownloadRequest {
    def requestId
    int requestor
    def requestTime
    def completionTime
    def requestStatus
    def response
    String processingChain
    int dataSetId
    List<RequestedScene> scenes = []

    DownloadRequest() {
        scenes = []
    }

    DownloadRequest(int requestId) {
        this()
        this.requestId = requestId
    }


    static enum RequestStatus {
        UNKNOWN(-1L), REQUESTED(0L), INVALID(1), STARTED(2L), DOWNLOADING(3), UNZIPPING(4), PROCESSING(5L), COMPLETED(6L), FAILED(7L)

        Long requestCode

        RequestStatus(Long requestCode) {
            this.requestCode = requestCode
        }

        def static byValue(final String requestStatus) {
            RequestStatus status = RequestStatus.UNKNOWN
            RequestStatus[] values = status.values()
            for (RequestStatus value : values) {
                if (value.toString().equals(requestStatus)) {
                    status = value
                    break
                }
            }
            status
        }

        def static byRequestCode(final Long requestCode) {
            RequestStatus reqStatus = UNKNOWN
            switch (requestCode) {
                case 0:
                    reqStatus = REQUESTED
                    break
                case 1:
                    reqStatus = INVALID
                    break
                case 2:
                    reqStatus = STARTED
                    break
                case 3:
                    reqStatus = DOWNLOADING
                    break
                case 4:
                    reqStatus = UNZIPPING
                    break
                case 5:
                    reqStatus = PROCESSING
                    break
                case 6:
                    reqStatus = COMPLETED
                    break
                case 7:
                    reqStatus = FAILED
                    break
                default:
                    reqStatus = UNKNOWN
                    break
            }
        }
    }
}