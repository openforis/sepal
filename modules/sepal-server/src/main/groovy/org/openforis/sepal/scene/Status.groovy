package org.openforis.sepal.scene


enum Status {
    UNKNOWN(-1L), REQUESTED(0L), INVALID(1), STARTED(2L), DOWNLOADING(3L), DOWNLOADED(4L), TRANSFORMING(5L), TRANSFORMED(6L), PROCESSING(7L), PROCESSED(8L), PUBLISHING(9L), PUBLISHED(10L), FAILED(11L)

    final Long requestCode

    Status(Long requestCode) {
        this.requestCode = requestCode
    }

    def static byValue(final String requestStatus) {
        Status status = UNKNOWN
        for (Status value : values()) {
            if (value.toString().equals(requestStatus)) {
                status = value
                break
            }
        }
        return status
    }
}