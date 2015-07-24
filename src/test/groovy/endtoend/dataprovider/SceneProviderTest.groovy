package endtoend.dataprovider

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import spock.lang.Specification
import spock.util.concurrent.PollingConditions

class SceneProviderTest extends Specification {

    protected static Logger LOG = LoggerFactory.getLogger(this);

    def workingDir = File.createTempDir('workingDir', null)
    def requestId = 1L
    def sceneId = 'id'

    def cleanup() {
        workingDir.deleteDir()
    }

    protected void eventually(Closure conditions) {
        new PollingConditions().eventually(conditions)
    }

}
