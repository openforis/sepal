package org.openforis.sepal.taskexecutor

import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import org.openforis.sepal.endpoint.Server
import org.openforis.sepal.taskexecutor.endpoint.Endpoints
import org.openforis.sepal.taskexecutor.endpoint.SepalAdminUsernamePasswordVerifier
import org.openforis.sepal.taskexecutor.endpoint.TaskExecutorEndpoint
import org.openforis.sepal.taskexecutor.endpoint.TaskExecutorUserProvider
import org.openforis.sepal.taskexecutor.gee.GoogleEarthEngineDownload
import org.openforis.sepal.taskexecutor.gee.HttpGoogleEarthEngineGateway
import org.openforis.sepal.taskexecutor.landsatscene.GoogleLandsatDownload
import org.openforis.sepal.taskexecutor.landsatscene.LandsatSceneDownload
import org.openforis.sepal.taskexecutor.landsatscene.S3Landsat8Download
import org.openforis.sepal.taskexecutor.manager.BackgroundExecutingTaskManager
import org.openforis.sepal.taskexecutor.manager.ExecutorBackedBackgroundExecutor
import org.openforis.sepal.taskexecutor.manager.SepalNotifyingTaskProgressMonitor
import org.openforis.sepal.taskexecutor.util.SleepingScheduler
import org.openforis.sepal.taskexecutor.util.download.BackgroundDownloader
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.annotation.ImmutableData
import org.openforis.sepal.util.lifecycle.Lifecycle
import org.openforis.sepal.util.lifecycle.Stoppable
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static java.util.concurrent.TimeUnit.SECONDS

class Main {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final List<Stoppable> toStop = []

    Main(ModuleConfig config) {
        LOG.info("Starting task-executor with $config")
        def userProvider = new TaskExecutorUserProvider(config.sepalUsername)
        def usernamePasswordVerifier = new SepalAdminUsernamePasswordVerifier(config.sepalUsername, config.sepalPassword)
        def pathRestrictions = new PathRestrictions(
                userProvider,
                new BasicRequestAuthenticator('Sepal-Task-Executor', usernamePasswordVerifier)
        )
        def progressMonitor = stoppable new SepalNotifyingTaskProgressMonitor(
                config.sepalEndpoint,
                config.taskExecutorUsername,
                config.taskExecutorPassword
        )
        def backgroundExecutor = stoppable new ExecutorBackedBackgroundExecutor(progressMonitor)
        def backgroundDownloader = stoppable new BackgroundDownloader()
        def taskManager = new BackgroundExecutingTaskManager([
                'landsat-scene-download'      : new LandsatSceneDownload.Factory(
                        config.workingDir,
                        new S3Landsat8Download(config.s3Endpoint, backgroundDownloader, config.username),
                        new GoogleLandsatDownload(config.googleEndpoint, backgroundDownloader, config.username),
                        config.username
                ),
                'google-earth-engine-download': new GoogleEarthEngineDownload.Factory(
                        config.workingDir,
                        config.username,
                        new SleepingScheduler(5, SECONDS),
                        new HttpGoogleEarthEngineGateway(config.googleEarthEngineDownloadEndpoint)
                )
        ], backgroundExecutor)
        def endpoints = new Endpoints(pathRestrictions,
                new TaskExecutorEndpoint(taskManager))
        start new Server(config.port, endpoints)
        addShutdownHook { stop() }
    }


    private <T extends Lifecycle> T start(T lifecycle) {
        lifecycle.start()
        toStop << lifecycle
        return lifecycle
    }

    private void stop() {
        toStop.reverse()*.stop()
    }

    private <T extends Stoppable> T stoppable(T stoppable) {
        toStop << stoppable
        return stoppable
    }

    static void main(String[] args) {
        try {
            if (args.length != 1)
                throw new IllegalArgumentException("Expected one argument with task-executor.properties path")
            def config = ModuleConfig.create(args[0])
            new Main(config)
        } catch (Exception e) {
            LOG.error('Failed to start Task-Executor', e)
            System.exit(1)
        }
    }

    @ImmutableData(knownImmutableClasses = [File])
    static class ModuleConfig {
        String username
        String taskExecutorUsername
        String taskExecutorPassword
        String sepalUsername
        String sepalPassword
        String sepalEndpoint
        URI s3Endpoint
        URI googleEndpoint
        URI googleEarthEngineDownloadEndpoint
        File workingDir
        int port

        static ModuleConfig create(String configPath) {
            def c = new Config(new File(configPath))
            new ModuleConfig(
                    username: c.string('username'),
                    taskExecutorUsername: c.string('taskExecutorUsername'),
                    taskExecutorPassword: c.string('taskExecutorPassword'),
                    sepalUsername: c.string('sepalUsername'),
                    sepalPassword: c.string('sepalPassword'),
                    sepalEndpoint: c.string('sepalEndpoint'),
                    s3Endpoint: c.uri('s3Endpoint'),
                    googleEndpoint: c.uri('googleEndpoint'),
                    googleEarthEngineDownloadEndpoint: c.uri('googleEarthEngineDownloadEndpoint'),
                    workingDir: c.file('workingDir'),
                    port: c.integer('port')
            )
        }
    }
}
