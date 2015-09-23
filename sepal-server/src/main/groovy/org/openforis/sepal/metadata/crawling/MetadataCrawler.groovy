package org.openforis.sepal.metadata.crawling

import org.openforis.sepal.metadata.MetadataProvider

interface MetadataCrawler{

    def crawl(MetadataProvider crawlerInfo)

    def getProviderId()
}





