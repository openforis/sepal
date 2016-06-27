package org.openforis.sepal.taskexecutor.util.download

import org.apache.http.client.config.RequestConfig
import org.apache.http.client.methods.HttpGet
import org.apache.http.impl.client.HttpClientBuilder
import org.openforis.sepal.taskexecutor.util.FileOwner
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.taskexecutor.util.download.Download.State.*

interface Download {
    URI getUri()

    void cancel()

    String getMessage()

    long getDownloadedBytes()

    boolean hasFailed()

    boolean isCanceled()

    boolean hasCompleted()

    enum State {
        PENDING, CONNECTING, DOWNLOADING, COMPLETED, FAILED, CANCELED
    }
}

final class ExecutableDownload implements Download {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    public static final int MAX_TRIES = 3
    final URI uri
    private final File file
    private final String username

    private HttpGet request
    private Download.State state = PENDING
    private String message
    private long downloadedBytes
    private int tries

    ExecutableDownload(URI uri, File file, String username) {
        this.username = username
        this.file = file
        this.uri = uri
        tries = MAX_TRIES
    }

    void setTries(int tries) {
        this.tries = tries
    }

    void execute() {
        for (int i = 0; i < tries; i++) {
            executeOnce()
            if (!hasFailed())
                return
            file.delete()
            resetDownloadedBytes()
            setMessage("Retry $i after failure: $message")
        }
    }

    private void executeOnce() {
        LOG.debug("Downloading $uri")
        FileOwner.set(file, username)
        try {
            setState(CONNECTING)
            def config = RequestConfig.custom()
                    .setConnectTimeout(10 * 1000)
                    .setSocketTimeout(30 * 1000)
                    .setConnectionRequestTimeout(10 * 1000)
                    .build()
            def http = HttpClientBuilder.create().setDefaultRequestConfig(config).build()
            setRequest(new HttpGet(uri))
            def response = http.execute(request)
            def status = response.statusLine.statusCode
            if (status >= 400) {
                setState(FAILED)
                setMessage("Failed to retrieve $uri. Expected 200, was " +
                        "$status $response.statusLine.reasonPhrase")
            } else if (!response.entity) {
                setState(FAILED)
                setMessage("Failed to retrieve $uri. No content.")
            } else {
                setState(DOWNLOADING)
                write(response.entity.content)
                setState(COMPLETED)
            }
        } catch (Exception e) {
            if (isCanceled()) {
                setState(FAILED)
                setMessage("Failed to retrieve $uri: $e.message")
            }
        }
        LOG.debug("Downloading $uri completed. [state: $state, message: $message]")
    }

    private void write(InputStream input) {
        BufferedInputStream bis = new BufferedInputStream(input);
        byte[] buf = new byte[8192];
        def out = new FileOutputStream(file)
        try {
            long startTime = System.nanoTime()
            int bytesRead
            while ((bytesRead = bis.read(buf)) != -1) {
                out.write(buf, 0, bytesRead)
                double timeInSeconds = (System.nanoTime() - startTime) / 1000000000d
                if (timeInSeconds > 0) {
                    incrementDownloadedBytes(bytesRead)
                }
                startTime = System.nanoTime()
            }
            out.flush()
        } finally {
            out.close()
        }
    }

    synchronized String getMessage() {
        return message
    }

    private synchronized void setMessage(String message) {
        this.message = message
    }

    synchronized long getDownloadedBytes() {
        return downloadedBytes
    }

    private synchronized void incrementDownloadedBytes(int additionalBytes) {
        this.downloadedBytes += additionalBytes
    }

    private synchronized void resetDownloadedBytes() {
        this.downloadedBytes = 0
    }

    private synchronized void setRequest(HttpGet request) {
        this.request = request
    }

    synchronized void cancel() {
        setState(CANCELED)
        setMessage("Canceled $uri")
        request?.abort()
    }

    private synchronized void setState(Download.State state) {
        this.state = state
    }

    synchronized boolean hasFailed() {
        return state == FAILED
    }

    synchronized boolean isCanceled() {
        return state == CANCELED
    }

    boolean hasCompleted() {
        return state == COMPLETED
    }

    String toString() {
        return uri
    }
}