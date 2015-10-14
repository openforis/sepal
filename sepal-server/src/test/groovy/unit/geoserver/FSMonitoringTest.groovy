package unit.geoserver

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.geoserver.FSChangeAwareListener
import org.openforis.sepal.geoserver.MonitorChangeHandler
import spock.lang.Ignore
import spock.lang.Specification


class FSMonitoringTest extends Specification {

    def userLayerHome = "LAYERS"
    def user = "a_user"
    def layer = "a_layer"
    def homeDir = File.createTempDir()
    def monitorChangeHandler = Mock(MonitorChangeHandler)
    def fsMonitor = new FSChangeAwareListener(homeDir, monitorChangeHandler)


    def setup() {
        SepalConfiguration.instance.properties = [(SepalConfiguration.LAYER_FOLDER_NAME_PARAMETER): userLayerHome]
        new Thread(new Runnable() {
            void run() {
                fsMonitor.watch()
            }
        }).start()
        Thread.sleep(500)

    }

    def 'When a new Folder is created under the root, the Handler should be notified'() {
        def userHome = new File(homeDir, user)
        when:
            userHome.mkdirs()
            Thread.sleep(500)
        then:
            1 * monitorChangeHandler.userAdded(user)

    }

    def 'When a file is created under the root, nothings should happen'() {
        when:
            new File(homeDir, "a_file.txt").createNewFile()
            Thread.sleep(200)
        then:
            0 * monitorChangeHandler.userAdded("a_file.txt")
    }

}
