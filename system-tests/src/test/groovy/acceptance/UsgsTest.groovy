package acceptance

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.Status
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.EarthExplorerClient
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.RestfulEarthExplorerClient
import spock.lang.Shared
import spock.lang.Specification


class UsgsTest extends Specification{

    @Shared EarthExplorerClient earthExplorerClient


    def setupSpec(){
        SepalConfiguration.instance.setConfigFileLocation('/data/sepal/config/test.properties')
        earthExplorerClient = new RestfulEarthExplorerClient()
    }


    def 'The EarthExplorer Client is able to login to the USGS Services'(){
        when:
        def link = earthExplorerClient.lookupDownloadLink(
                new SceneRequest(1L,new SceneReference(id:'LC81920292015285LGN00', dataSet: DataSet.LANDSAT_8),'',new Date(),Status.DOWNLOADING))
        then:
        link

    }

}
