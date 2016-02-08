package org.openforis.sepal.component.datasearch.metadata.crawling

import org.apache.commons.io.IOUtils
import org.openforis.sepal.component.datasearch.metadata.MetadataProvider
import org.openforis.sepal.component.datasearch.metadata.UsgsDataRepository
import org.openforis.sepal.util.XmlUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

abstract class XmlMetadataCrawler extends BaseMetadataCrawler {

    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final File downloadWorkingDir


    XmlMetadataCrawler(UsgsDataRepository usgsDataRepository, String downloadWorkingDirectory) {
        super(usgsDataRepository)
        this.downloadWorkingDir = new File(downloadWorkingDirectory)
    }

    protected def applyCriteria(entries, MetadataProvider providerInfo) {
        providerInfo?.crawlingCriterias?.each { criteria ->
            entries = entries.findResults { entry ->
                XmlUtils.nodeToMap(entry).get(criteria.fieldName) == criteria.expectedValue ? entry : null
            }
        }
        return entries
    }

    protected def parse(metadataFile, String tagName) {
        new XmlSlurper().parse(metadataFile).depthFirst().findAll { it.name() == tagName }
    }

    protected def store(InputStream stream) {
        def fName = "metadata_" + System.currentTimeMillis() + ".xml"
        File fsFile = new File(downloadWorkingDir, fName)
        LOG.debug("Tmp file name $fsFile.absolutePath")
        FileOutputStream fos = new FileOutputStream(fsFile)
        fos.withCloseable {
            IOUtils.copy(stream, fos)
        }
        return fsFile
    }
}
