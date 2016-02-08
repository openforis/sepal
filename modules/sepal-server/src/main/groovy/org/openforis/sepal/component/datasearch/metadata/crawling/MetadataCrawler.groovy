package org.openforis.sepal.component.datasearch.metadata.crawling

import org.openforis.sepal.component.datasearch.metadata.MetadataProvider

interface MetadataCrawler {

    def crawl(MetadataProvider crawlerInfo)

    def getProviderId()
}





