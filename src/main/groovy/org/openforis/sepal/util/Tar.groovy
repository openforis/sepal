package org.openforis.sepal.util

import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.io.IOUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.zip.GZIPInputStream

class Tar {
    private static final Logger LOG = LoggerFactory.getLogger(this)


    static void unpackTarGz(File archive) {
        if (!archive.name.endsWith('.tar.gz'))
            throw new IllegalArgumentException("$archive.name does not endsWith .tar.gz")
        LOG.debug("Unpacking archive $archive")
        File tarFolder = archive.parentFile
        def tarName = archive.name.lastIndexOf('.').with { it != -1 ? archive.name[0..<it] : archive.name }
        File tarFile = new File(tarFolder, tarName)
        if (!(tarFile.exists())) {
            GZIPInputStream gZIPStream = new GZIPInputStream(new FileInputStream(archive))
            FileOutputStream fos = new FileOutputStream(tarFile)
            IOUtils.copy(gZIPStream, fos)
            gZIPStream.close()
            fos.close()
        }

        TarArchiveInputStream tarInputStream = new TarArchiveInputStream(new FileInputStream(tarFile))
        String tarFolderName = archive.getName().substring(0, tarName.lastIndexOf('.'))
        TarArchiveEntry entry
        while ((entry = tarInputStream.getNextTarEntry()) != null) {
            LOG.debug("Unpacking archive entry $entry.name")
            File tarEntry = new File(tarFolder, entry.getName())
            if (entry.directory)
                tarEntry.mkdirs()
            else {
                FileOutputStream outputFile = new FileOutputStream(tarEntry, false)
                IOUtils.copy(tarInputStream, outputFile)
                outputFile.close()
            }
        }
        tarInputStream.close()
        tarFile.delete()
        archive.delete()
    }
}
