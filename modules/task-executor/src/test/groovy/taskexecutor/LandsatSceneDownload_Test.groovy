package taskexecutor

import fake.server.GoogleLandsatServer
import fake.server.S3LandsatServer
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.api.TaskFailed
import org.openforis.sepal.taskexecutor.landsatscene.GoogleLandsatDownload
import org.openforis.sepal.taskexecutor.landsatscene.LandsatSceneDownload
import org.openforis.sepal.taskexecutor.landsatscene.S3Landsat8Download
import org.openforis.sepal.taskexecutor.util.NamedThreadFactory
import org.openforis.sepal.taskexecutor.util.download.BackgroundDownloader
import spock.lang.Ignore
import spock.lang.Specification

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LandsatSceneDownload_Test extends Specification {
    def workingDir = File.createTempDir()
    def s3Server = new S3LandsatServer().start() as S3LandsatServer
    def googleLandsatServer = new GoogleLandsatServer().start() as GoogleLandsatServer
    def downloader = new BackgroundDownloader()
    def username = System.getProperty("user.name")
    def factory = new LandsatSceneDownload.Factory(
            workingDir,
            new S3Landsat8Download(s3Server.uri, downloader, username),
            new GoogleLandsatDownload(googleLandsatServer.uri, downloader, username),
            username
    )

    def cleanup() {
        workingDir.deleteDir()
    }

    def 'Can download Landsat 8 scenes'() {
        def sceneIds = ['LC80010032014272LGN00', 'LC81910312015182LGN00']
        when:
        execute(new Task('some-id', 'landsat-scene-download', [sceneIds: sceneIds]))

        then:
        workingDir.list().toList().toSet() == sceneIds.toSet()

        new File(workingDir, 'LC80010032014272LGN00').list()
        new File(workingDir, 'LC80010032014272LGN00').eachFile {
            assert it.text == it.name
        }

        new File(workingDir, 'LC81910312015182LGN00').list()
        new File(workingDir, 'LC81910312015182LGN00').eachFile {
            assert it.text == it.name
        }
    }

    @Ignore
    def 'Test with real scenes'() {
        def factory = new LandsatSceneDownload.Factory(
                workingDir,
                new S3Landsat8Download(URI.create('http://landsat-pds.s3.amazonaws.com/'), downloader, username),
                new GoogleLandsatDownload(URI.create('http://storage.googleapis.com/'), downloader, username),
                username
        )
        def sceneIds = ['LE70010032000146KIS00', 'LC81910312015182LGN00']
        def task = new Task('some-id', 'landsat-scene-download', [sceneIds: sceneIds])
        def executor = factory.create(task)
        Executors.newSingleThreadScheduledExecutor(NamedThreadFactory.singleThreadFactory('Progress-printer')).scheduleAtFixedRate({
            try {
                println executor.progress().message
            } catch (Throwable e) {
                e.printStackTrace()
            }
        },
                0, 1, TimeUnit.SECONDS)

        when:
        executor.execute()

        then:
        true
    }

    def 'Throws exception when Landsat 8 scene download fails'() {
        s3Server.fail('LC80010032014272LGN00_B10.TIF.ovr')
        def sceneIds = ['LC80010032014272LGN00']
        when:
        execute(new Task('some-id', 'landsat-scene-download', [sceneIds: sceneIds]))

        then:
        thrown TaskFailed
    }

    def 'Can download a Landsat 7 scene'() {
        when:
        execute(new Task('some-id', 'landsat-scene-download', [sceneIds: ['LE70010032000146KIS00']]))

        then:
        workingDir.list().toList() == ['LE70010032000146KIS00']

        new File(workingDir, 'LE70010032000146KIS00').list()
        new File(workingDir, 'LE70010032000146KIS00').eachFile {
            assert it.text.trim() == it.name
        }
    }

    def 'Can get status before executing task'() {
        def task = new Task('some-id', 'landsat-scene-download', [sceneIds: ['LE70010032000146KIS00']])
        def executor = factory.create(task)

        when:
        def progress = executor.progress()

        then:
        progress.message == 'Completed 0 of 1 scenes (Unpacking scenes)'
    }

    def 'Can get status after executing task'() {
        def task = new Task('some-id', 'landsat-scene-download', [sceneIds: ['LE70010032000146KIS00']])
        def executor = execute(task)

        when:
        def progress = executor.progress()

        then:
        progress.message == 'Completed 1 scene'
    }

    private TaskExecutor execute(Task task) {
        def executor = factory.create(task)
        executor.execute()
        return executor
    }
}
