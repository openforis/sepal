package endtoend

import spock.lang.Ignore;
import spock.lang.Specification
import util.DirectoryStructure

@Ignore
class DownloaderTest extends Specification {
    private static final USER_ID = 1
    private static final DATASET_ID = 2

    private final SepalDriver driver = new SepalDriver()
            .withUsers(USER_ID)
            .withActiveDataSets(DATASET_ID)
//            .startDownloader()

    def cleanup() {
        driver.stop()
    }

    def 'When a download request is made, requested scene is downloaded and unpacked in the user home dir'() {
        def request = [
                userId   : USER_ID,
                dataSetId: DATASET_ID,
                sceneIds : ['the_scene_id']
        ]

        when:
            driver.postDownloadRequests(request)
        then:
            driver.eventually {
                DirectoryStructure.matches(driver.homeDir) {
                    user1 {
                        the_scene_id {
                            '1.tif'()
                            '2.tif'()
                        }
                    }
                }
            }

    }
}
