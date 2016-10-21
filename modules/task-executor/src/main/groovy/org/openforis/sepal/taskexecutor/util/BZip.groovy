package org.openforis.sepal.taskexecutor.util

import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.apache.commons.compress.utils.IOUtils

class BZip {

    static File decompress(File tarBz, String owner) {
        if (!tarBz.name.endsWith('.tar.bz'))
            throw new IllegalArgumentException("$tarBz.name does not endsWith .tar.bz")
        def tarFile = bz(tarBz, owner)
        tar(tarFile, owner)
        tarBz.delete()
        return tarBz.parentFile
    }

    private static File bz(File bzFile, String owner) {
        if (!bzFile.name.endsWith('.bz'))
            throw new IllegalArgumentException("$bzFile.name does not endsWith .bz")
        File folder = bzFile.parentFile
        def tarName = bzFile.name.lastIndexOf('.').with { it != -1 ? bzFile.name[0..<it] : bzFile.name }
        def file = new File(folder, tarName)
        file.delete()
        FileOwner.set(file, owner)
        BZip2CompressorInputStream bZIPStream = new BZip2CompressorInputStream(new FileInputStream(bzFile))
        FileOutputStream fos = new FileOutputStream(file)
        try {
            IOUtils.copy(bZIPStream, fos)
        } finally {
            bZIPStream.close()
            fos.close()
        }
        bzFile.delete()
        return file
    }

    private static void tar(File tarFile, String owner) {
        if (!tarFile.name.endsWith('.tar'))
            throw new IllegalArgumentException("$tarFile.name does not endsWith .tar")
        def folder = tarFile.parentFile
        def tarInputStream = new TarArchiveInputStream(new FileInputStream(tarFile))
        try {
            TarArchiveEntry entry
            while (entry = tarInputStream.getNextTarEntry()) {
                def tarEntry = new File(folder, entry.getName())
                tarEntry.parentFile.mkdirs()
                if (entry.directory) {
                    tarEntry.mkdirs()
                    FileOwner.setOnDir(tarEntry, owner)
                }
                else {
                    FileOwner.set(tarEntry, owner)
                    FileOutputStream outputFile = new FileOutputStream(tarEntry, false)
                    IOUtils.copy(tarInputStream, outputFile)
                    outputFile.close()
                }
            }
            tarFile.delete()
        } finally {
            tarInputStream.close()
        }
    }
}
