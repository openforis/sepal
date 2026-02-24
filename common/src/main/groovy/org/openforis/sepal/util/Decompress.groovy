package org.openforis.sepal.util

import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.io.IOUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.zip.GZIPInputStream

class Decompress {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    static File tarGz(File tarGz) {
        if (!tarGz.name.endsWith('.tar.gz'))
            throw new IllegalArgumentException("$tarGz.name does not endsWith .tar.gz")
        def tarFile = gz(tarGz)
        tar(tarFile)
        tarGz.delete()
        return tarGz.parentFile
    }

    static File gz(File gzFile) {
        if (!gzFile.name.endsWith('.gz'))
            throw new IllegalArgumentException("$gzFile.name does not endsWith .gz")
        LOG.debug("Unpacking $gzFile")
        File folder = gzFile.parentFile
        def tarName = gzFile.name.lastIndexOf('.').with { it != -1 ? gzFile.name[0..<it] : gzFile.name }
        def file = new File(folder, tarName)
        file.delete()
        GZIPInputStream gZIPStream = new GZIPInputStream(new FileInputStream(gzFile))
        FileOutputStream fos = new FileOutputStream(file)
        try {
            IOUtils.copy(gZIPStream, fos)
        } finally {
            gZIPStream.close()
            fos.close()
        }
        gzFile.delete()
        return file
    }

    static File tar(File tarFile) {
        if (!tarFile.name.endsWith('.tar'))
            throw new IllegalArgumentException("$tarFile.name does not endsWith .tar")
        LOG.debug("Unpacking $tarFile")
        def folder = tarFile.parentFile
        def tarInputStream = new TarArchiveInputStream(new FileInputStream(tarFile))
        try {
            TarArchiveEntry entry
            while (entry = tarInputStream.getNextTarEntry()) {
                LOG.debug("Unpacking archive entry $entry.name")
                def tarEntry = new File(folder, entry.getName())
                if (entry.directory)
                    tarEntry.mkdirs()
                else {
                    FileOutputStream outputFile = new FileOutputStream(tarEntry, false)
                    IOUtils.copy(tarInputStream, outputFile)
                    outputFile.close()
                }
            }
            tarFile.delete()
            return folder
        } finally {
            tarInputStream.close()
        }
    }
}
