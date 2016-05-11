package org.openforis.sepal.component.datasearch.usgs

import groovy.util.slurpersupport.GPathResult
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import org.openforis.sepal.component.datasearch.SceneMetaData

import static org.openforis.sepal.component.datasearch.MetaDataSource.USGS
import static org.openforis.sepal.util.DateTime.startOfDay

interface UsgsGateway {
    /**
     * Invokes callback for scenes updated since provided date.
     *
     * @param date scene updated before this date will not be included
     * @param callback invoked with list of SceneMetaData instances
     */
    void eachSceneUpdatedSince(Date date, Closure callback) throws SceneMetaDataRetrievalFailed

    class SceneMetaDataRetrievalFailed extends RuntimeException {
        SceneMetaDataRetrievalFailed(String message) {
            super(message)
        }
    }
}

class RestBasedUsgsGateway implements UsgsGateway {
    private final int daysPerRequest = 1
    private final usgs = new RESTClient('http://earthexplorer.usgs.gov/EE/InventoryStream/')
    private final sensors = [
            'LANDSAT_8',
            'LANDSAT_ETM_SLC_OFF',
            'LANDSAT_ETM',
            'LANDSAT_TM',
            'LANDSAT_MSS',
            'LANDSAT_COMBINED',
            'LANDSAT_COMBINED78'
    ]
    private final pathRowRestriction = [
            start_path: 1,
            start_row: 1,
            end_path: 233,
            end_row: 248
    ] as Map<String, Object>

    RestBasedUsgsGateway() {
        usgs.handler.failure = { resp -> return resp }
    }

    void eachSceneUpdatedSince(Date date, Closure callback) {
        def today = startOfDay(new Date())
        def startDate = date
        def endDate = [date + daysPerRequest, today].min()
        while (!Thread.interrupted()) {
            sensors.each { sensor ->
                def query = pathRowRestriction + [start_date: startDate.format('yyyy-MM-dd'), end_date: endDate.format('yyyy-MM-dd'), sensor: sensor]
                def response = usgs.get(path: 'pathrow', query: query) as HttpResponseDecorator
                veryfyResponse(response)
                def scenes = response.data.metaData
                        .findAll { it.DATA_TYPE_L1.text() == 'L1T' }
                        .collect { toSceneMetaData(sensor, it) }
                callback.call(scenes)
            }
            if (endDate >= today)
                return
            startDate = endDate + 1
            endDate = [startDate + daysPerRequest, today].min()
        }
    }

    private void veryfyResponse(HttpResponseDecorator response) {
        def data = response.data
        if (response.status != 200)
            throw new UsgsGateway.SceneMetaDataRetrievalFailed("Unexpected response status: $response.status: ${response.statusLine?.reasonPhrase}")
        if (!(data instanceof GPathResult))
            throw new UsgsGateway.SceneMetaDataRetrievalFailed(new XmlSlurper().parseText(data.text).returnStatus.text())
    }

    @SuppressWarnings(["GroovyAssignabilityCheck"])
    private SceneMetaData toSceneMetaData(String sensor, metaData) {
        def acquisitionDate = Date.parse('yyyy-MM-dd', metaData.acquisitionDate.text())
        // Update time can sometimes be earlier than a acquisition date, which doesn't make sense.
        def updateTime = [Date.parse('yyyy-MM-dd', metaData.dateUpdated.text()), acquisitionDate].max()
        return new SceneMetaData(
                id: metaData.sceneID,
                source: USGS,
                sceneAreaId: "${metaData.path}_${metaData.row}",
                sensorId: sensor,
                acquisitionDate: acquisitionDate,
                cloudCover: metaData.cloudCoverFull.toDouble(),
                sunAzimuth: metaData.sunAzimuth.toDouble(),
                sunElevation: metaData.sunElevation.toDouble(),
                browseUrl: URI.create(metaData.browseURL.text()),
                updateTime: updateTime
        )
    }
}
