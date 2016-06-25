package integration

import fake.server.GoogleLandsatServer
import fake.server.S3LandsatServer
import fake.server.SepalServer
import groovymvc.Params
import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.Main
import spock.lang.Specification
import spock.util.concurrent.PollingConditions
import util.Port

import static groovy.json.JsonOutput.toJson

class Main_Test extends Specification {
    def s3Server = new S3LandsatServer().start() as S3LandsatServer
    def googleLandsatServer = new GoogleLandsatServer().start() as GoogleLandsatServer
    def sepalServer = new SepalServer().start() as SepalServer
    def workingDir = File.createTempDir()
    def downloadDir = File.createTempDir()
    def port = Port.findFree()
    def propertiesFile = File.createTempFile('task-executor', '.properties')
    def config = [
            taskExecutorUsername: 'task-executor',
            taskExecutorPassword: 'task-executor password',
            sepalUsername       : 'sepal',
            sepalPassword       : 'sepal password',
            sepalEndpoint       : "http://localhost:$sepalServer.port/" as String,
            s3Endpoint          : "http://localhost:$s3Server.port/" as String,
            googleEndpoint      : "http://localhost:$googleLandsatServer.port/" as String,
            workingDir          : workingDir.absolutePath,
            username            : 'admin',
            userDownloadDir     : downloadDir.absolutePath,
            port                : port as String,
    ]
    def client = new RESTClient("http://localhost:$port/api/")

    def setup() {
        def properties = new Properties()
        properties.putAll(config)
        properties.store(new FileWriter(propertiesFile), 'Test properties')
        Main.main(propertiesFile.absolutePath)
        client.auth.basic config.sepalUsername, config.sepalPassword
    }

    def cleanup() {
        workingDir.deleteDir()
        downloadDir.deleteDir()
        propertiesFile.deleteDir()
    }

    def 'Downloads L7 and L8 scenes, adds them to the user download dir, and notifies on completion'() {
        def conditions = new PollingConditions(timeout: 2)
        def notification = null as Params
        sepalServer.onTaskProgress {
            notification = params
        }
        when:
        def response = client.post(path: 'tasks', query: [
                id       : 'some-task-id',
                operation: 'landsat-scene-download',
                params   : toJson([sceneIds: ['LC80010032014272LGN00', 'LE70010032000146KIS00']])
        ])

        then:
        response.status == 201
        conditions.eventually {
            assert notification
        }
        notification.state == 'COMPLETED'
        // TODO: Check download files/owner/permissions
    }
}
