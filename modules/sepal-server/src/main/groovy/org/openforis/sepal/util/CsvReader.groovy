package org.openforis.sepal.util

import groovyx.net.http.HTTPBuilder
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.Method.GET

interface CsvReader {
    /**
     * Iterates each line in a CSV.
     * Closure is passed a Map from column name to value. If closure returns false, iteration is aborted.
     */
    void eachLine(Closure closure)
}

/**
 * Really simple CSV reader, which will not handle quotes.
 */
class CsvInputStreamReader implements CsvReader {
    private final InputStream inputStream

    CsvInputStreamReader(InputStream inputStream) {
        this.inputStream = inputStream
    }

    void eachLine(Closure closure) {
        def reader = new InputStreamReader(inputStream, 'UTF-8')
        def columns = reader.readLine().split(',').collect { it.trim() }
        for (String line : reader) {
            def data = [:]
            line.split(',')
                    .collect { it.trim() }
                    .eachWithIndex { value, int i ->
                data[columns[i]] = value
            }
            def result = closure.call(data)
            if (result instanceof Boolean && !result)
                break
        }
    }
}

class CsvUriReader implements CsvReader {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String uri

    CsvUriReader(String uri) {
        this.uri = uri
    }

    void eachLine(Closure closure) {
        LOG.info("Reading " + uri)
        new HTTPBuilder(uri).request(GET) { req ->
            response.success = { resp, InputStream input ->
                new CsvInputStreamReader(input).eachLine { closure }
            }

            response.failure = { resp ->
                throw new IOException("Failed to retrieve $uri. Response status: $resp.status")
            }
        }
    }
}

class GzCsvUriReader implements CsvReader {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String uri
    private final File workingDir
    private final File gzFile
    private final File csvFile

    GzCsvUriReader(String uri, File workingDir, String gzFileName) {
        this.uri = uri
        this.workingDir = workingDir
        this.gzFile = new File(workingDir, gzFileName.endsWith('.gz') ? gzFileName : gzFileName + ".gz")
        this.csvFile = new File(workingDir, FileSystem.removeFileExtension(gzFile.name))
        workingDir.mkdirs()
    }

    void eachLine(Closure callback) {
        if (csvFile.exists())
            LOG.info("$gzFile already downloaded and decompressed - skipping")
        else
            downloadThenRead(callback)
    }

    private Object downloadThenRead(Closure callback) {
        LOG.info("Downloading $uri to $workingDir")
        new HTTPBuilder(uri).request(GET) { req ->
            response.success = { resp, InputStream input ->
                new FileOutputStream(gzFile).withStream {
                    it << input
                    it.flush()
                }
                LOG.info("Decompressing " + gzFile)
                Decompress.gz(gzFile)
                readCsvFile(callback)
                csvFile.delete()
            }

            response.failure = { resp ->
                throw new IOException("Failed to retrieve $uri. Response status: $resp.status")
            }
        }
    }

    private readCsvFile(Closure callback) {
        new CsvInputStreamReader(new FileInputStream(csvFile)).eachLine(callback)
    }
}
