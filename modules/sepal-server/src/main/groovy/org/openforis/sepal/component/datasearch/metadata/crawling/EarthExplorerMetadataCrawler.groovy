package org.openforis.sepal.component.datasearch.metadata.crawling

import groovy.util.slurpersupport.GPathResult
import org.openforis.sepal.component.dataprovider.DataSet
import org.openforis.sepal.component.datasearch.metadata.MetadataProvider
import org.openforis.sepal.component.datasearch.metadata.UsgsDataRepository
import org.openforis.sepal.util.DateTime
import org.openforis.sepal.util.ResourceLocator
import org.openforis.sepal.util.XmlUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.util.DateTime.parseEarthExplorerDateString
import static org.openforis.sepal.util.DateTime.todayDateString

class EarthExplorerMetadataCrawler extends XmlMetadataCrawler {

    private static final Integer PROVIDER_ID = 1
    private static final Logger LOG = LoggerFactory.getLogger(this)


    final ResourceLocator downloader


    EarthExplorerMetadataCrawler(UsgsDataRepository usgsDataRepository, ResourceLocator downloader, String downloadWorkingDirectory) {
        super(usgsDataRepository, downloadWorkingDirectory)
        this.downloader = downloader
    }

    @Override
    def getProviderId() { PROVIDER_ID }


    def crawl(MetadataProvider crawlerInfo) {
        LOG.debug("Going to crawl $crawlerInfo")
        int iterations = crawlerInfo.iterations
        def currentEndDate = new Date()
        def currentStartDate = DateTime.addDays(currentEndDate, crawlerInfo.iterationSize * -1)
        iterations.times {
            def end = DateTime.toDateString(currentEndDate)
            def start = DateTime.toDateString(currentStartDate)
            crawlerInfo.dataSets.each { dataSet ->
                def baseDownloadURL = "$crawlerInfo.entrypoint?sensor=$dataSet&start_path=1&start_row=1&end_path=233&end_row=248"
                def downloadUrl = "$baseDownloadURL&start_date=$start&end_date=$end"
                LOG.info("Downloading Earth Explorer metadata. dataSet: $dataSet, url: $downloadUrl")
                downloader.download(downloadUrl) { InputStream inputStream ->
                    def storedFile = store(inputStream)
                    process(dataSet, storedFile, crawlerInfo)
                }
            }
            currentEndDate = DateTime.addDays(currentStartDate, -1)
            currentStartDate = DateTime.addDays(currentEndDate, crawlerInfo.iterationSize * -1)
        }

    }

    private def process(DataSet dataSet, metadataFile, providerInfo) {
        try {
            LOG.trace("Going to process $metadataFile.absolutePath")
            def metaDataTags = applyCriteria(parse(metadataFile, 'metaData'), providerInfo)
            def occurences = metaDataTags.size()
            LOG.debug("Found $occurences Occurences")
            def counter = 0
            metaDataTags.each {
                ++counter
                def attributeMap = normalize(it)
                def sceneId = attributeMap.sceneID
                def row = usgsDataRepository.getSceneMetadata(dataSet.id, sceneId)
                def dateUpdated = DateTime.parseDateString(attributeMap.dateUpdated)
                if (row && dateUpdated > row.dateUpdated) {
                    LOG.trace("$counter/$occurences: $sceneId Updating values")
                    updateMetadata(attributeMap, row.id)
                } else if (!row) {
                    LOG.trace("$counter/$occurences: $sceneId New insertions")
                    insertMetadata(dataSet, attributeMap)
                } else {
                    LOG.trace("$counter/$occurences: $sceneId Already available")
                }
            }
        } finally {
            metadataFile.delete()
        }
    }


    private def normalize(GPathResult node) {
        def attributeMap = XmlUtils.nodeToMap(node)

        /*  Parsing/Checking date strings */
        def startTime = attributeMap.get('sceneStartTime')
        startTime = (startTime) ? parseEarthExplorerDateString(startTime) : null
        attributeMap.put('sceneStartTime', startTime)

        def endTime = attributeMap.get('sceneStopTime')
        endTime = (endTime) ? parseEarthExplorerDateString(endTime) : null
        attributeMap.put('sceneStopTime', endTime)

        if (!(attributeMap.get("acquisitionDate"))) {
            attributeMap.put("acquisitionDate", todayDateString())
        }
        if (!(attributeMap.get("dateUpdated"))) {
            attributeMap.put("dateUpdated", attributeMap.get("acquisitionDate"))
        }

        return attributeMap

    }
}