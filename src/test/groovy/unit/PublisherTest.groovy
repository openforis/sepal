package unit

import org.openforis.sepal.geoserver.GeoServer
import org.openforis.sepal.geoserver.ProcessingChain
import org.openforis.sepal.geoserver.Publisher
import spock.lang.Ignore
import spock.lang.Specification

@Ignore
class PublisherTest extends Specification {
    def geoServer = Mock(GeoServer)
    def processingChain = Mock(ProcessingChain)
    File home
    File target
    String relativeLayersPath = 'layers'

    def setup() {
        home = File.createTempDir('home-', '')
        target = File.createTempDir('target-', '')
    }

    def cleanup() {
        home.deleteDir()
        target.deleteDir()
    }

    def 'Workspace is created for new users'() {
        createUserDir('paul')

        when:
            createPublisher()
        then:
            1 * geoServer.addWorkspace('paul')
    }

    def 'Workspace is not created for existing users'() {
        createUserDir('paul')
        createPublisher()
        when:
            createPublisher()

        then:
            0 * geoServer.addWorkspace('paul')
    }

    def 'If not layers dir exists in user home, it is created'() {
        createUserDir('paul')
        when:
            createPublisher()
        then:
            layersDir('paul').exists()
    }

    def 'Layer with images is processed then published'() {
        def image = createLayer('paul', 'my-layer', 'image.tif').first()
        def targetLayerDir = targetLayerDir('paul', 'my-layer')
        when:
            createPublisher()
        then:
            1 * processingChain.process(image)

        then:
            1 * geoServer.publishLayer('paul', targetLayerDir)
    }

    def 'Layer without images is not published'() {
        createLayer('paul', 'my-layer')
        def targetLayerDir = targetLayerDir('paul', 'my-layer')
        when:
            createPublisher()
        then:
            0 * geoServer.publishLayer('paul', targetLayerDir)
    }

    def 'Layer with images is not processed or published if image is not modified since last published'() {
        createLayer('paul', 'my-layer', 'image.tif')
        createPublisher()
        when:
            createPublisher()
        then:
            0 * processingChain.process(_ as File)
            0 * geoServer.publishLayer('paul', _ as File)
    }

    def 'Layer with images is processed then published if image is modified since last published'() {
        def image = createLayer('paul', 'my-layer', 'image.tif').first()
        def targetLayerDir = targetLayerDir('paul', 'my-layer')
        createPublisher()
        when:
            image.setLastModified(Long.MAX_VALUE)
            createPublisher()
        then:
            1 * processingChain.process(image)
        then:
            1 * geoServer.publishLayer('paul', targetLayerDir)
    }

    def 'Only updated images are processed before republishing layer'() {
        def images = createLayer('paul', 'my-layer', 'image0.tif', 'image1.tif')
        def targetLayerDir = targetLayerDir('paul', 'my-layer')
        createPublisher()
        images[0].setLastModified(Long.MAX_VALUE)
        when:
            createPublisher()
        then:
            1 * processingChain.process(images[0])
            0 * processingChain.process(images[1])
        then:
            1 * geoServer.publishLayer('paul', targetLayerDir)
    }

    def 'Only added images are processed before republishing layer'() {
        def image1 = createLayer('paul', 'my-layer', 'image1.tif').first()
        def targetLayerDir = targetLayerDir('paul', 'my-layer')
        createPublisher()
        def image2 = addImage('paul', 'my-layer', 'image2.tif')

        when:
            createPublisher()

        then:
            0 * processingChain.process(image1)
            1 * processingChain.process(image2)

        then:
            1 * geoServer.publishLayer('paul', targetLayerDir)
    }

    def 'When workspace is created when user is added'() {
        def publisher = createPublisher()
        def userDir = createUserDir('paul')
        when:
            publisher.userAdded(userDir)
        then:
            1 * geoServer.addWorkspace('paul')
    }

    def 'When layer is added, images are processed then published'() {
        def publisher = createPublisher()
        def image = createLayer('paul', 'my-layer', 'image.tif').first()
        def targetLayerDir = targetLayerDir('paul', 'my-layer')

        when:
            publisher.layerUpdated('paul', image.parentFile)
        then:
            1 * processingChain.process(image)

        then:
            1 * geoServer.publishLayer('paul', targetLayerDir)
    }

    def 'When layer is updated, only updated images are processed before republishing layer'() {
        def images = createLayer('paul', 'my-layer', 'image0.tif', 'image1.tif')
        def targetLayerDir = targetLayerDir('paul', 'my-layer')
        def publisher = createPublisher()
        images[0].setLastModified(Long.MAX_VALUE)
        when:
            publisher.layerUpdated('paul', layerDir('paul', 'my-layer'))
        then:
            1 * processingChain.process(images[0])
            0 * processingChain.process(images[1])
        then:
            1 * geoServer.publishLayer('paul', targetLayerDir)
    }

    @Ignore
    def 'When layer is removed, it is removed from GeoServer'() {
        def image = createLayer('paul', 'my-layer', 'image.tif').first()
        def publisher = createPublisher()
        def targetLayerDir = targetLayerDir('paul', 'my-layer')

        when:
            publisher.layerRemoved('paul', image.parentFile)
        then:
            1 * geoServer.removeLayer('paul', targetLayerDir)
    }

    // TODO: Remove image, layer, user

    private File targetLayerDir(String userName, String layerName) {
        new File("$target/$userName/$layerName")
    }

    Publisher createPublisher() {
        new Publisher(home, target, relativeLayersPath, processingChain, geoServer)
    }

    void containsDirs(File dir, String... expectedDirs) {
        def dirs = dir.listFiles()*.name
        def expected = expectedDirs as List
        assert dirs == expected
    }

    List<File> createLayer(String userName, String layerName, String... images) {
        createUserDir(userName)
        def layersDir = layersDir(userName)
        def layerDir = new File(layersDir, layerName)
        layerDir.mkdirs()
        return images.collect {
            def image = new File(layerDir, it)
            image.write("Image $it")
            return image
        }
    }

    File addImage(String userName, String layerName, String image) {
        createUserDir(userName)
        def layersDir = layersDir(userName)
        def layerDir = new File(layersDir, layerName)
        layerDir.mkdirs()
        def imageFile = new File(layerDir, image)
        imageFile.write("Image $image")
        return imageFile
    }

    File createUserDir(String userName) {
        def userDir = new File(home, userName)
        userDir.mkdir()
        def layersDir = layersDir(userName)
        return userDir
    }

    File layersDir(String userName) {
        new File("$home/$userName/$relativeLayersPath")
    }

    File layerDir(String userName, String layerName) {
        new File(layersDir(userName), layerName)
    }

    File imageFile(String userName, String layerName, String image) {
        new File(layerDir(userName, layerName), image)
    }

}
