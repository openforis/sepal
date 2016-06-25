package org.openforis.sepal.taskexecutor

import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import org.openforis.sepal.taskexecutor.endpoint.Endpoints
import org.openforis.sepal.taskexecutor.endpoint.SepalAdminUsernamePasswordVerifier
import org.openforis.sepal.taskexecutor.endpoint.TaskExecutorEndpoint
import org.openforis.sepal.taskexecutor.endpoint.TaskExecutorUserProvider
import org.openforis.sepal.taskexecutor.landsatscene.GoogleLandsatDownload
import org.openforis.sepal.taskexecutor.landsatscene.LandsatSceneDownload
import org.openforis.sepal.taskexecutor.landsatscene.S3Landsat8Download
import org.openforis.sepal.taskexecutor.manager.BackgroundExecutingTaskManager
import org.openforis.sepal.taskexecutor.manager.ExecutorBackedBackgroundExecutor
import org.openforis.sepal.taskexecutor.manager.SepalNotifyingTaskProgressMonitor
import org.openforis.sepal.taskexecutor.util.ConfigLoader
import org.openforis.sepal.taskexecutor.util.Stoppable
import org.openforis.sepal.taskexecutor.util.annotation.ImmutableData
import org.openforis.sepal.taskexecutor.util.download.BackgroundDownloader
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class Main {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final List<Stoppable> toStop = []

    Main(Config config) {
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
        def backgroundDownloader = new BackgroundDownloader()
        def taskManager = new BackgroundExecutingTaskManager([
                'landsat-scene-download': new LandsatSceneDownload.Factory(
                        config.workingDir,
                        new S3Landsat8Download(config.s3Endpoint, backgroundDownloader),
                        new GoogleLandsatDownload(config.googleEndpoint, backgroundDownloader)
                )
        ], backgroundExecutor)
        def endpoint = new TaskExecutorEndpoint(taskManager)
        Endpoints.deploy(config.port, pathRestrictions, endpoint)
        addShutdownHook { stop() }
    }

    private void stop() {
        Endpoints.undeploy()
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
            def config = Config.create(args[0])
            new Main(config)
        } catch (Exception e) {
            LOG.error('Failed to start Task-Executor', e)
            System.exit(1)
        }
    }

    static String get(String key, Map<String, String> m) {
        def value = m[key]
        if (!value)
            throw new IllegalArgumentException("Configuration requires '$key'")
        return value
    }

    @ImmutableData(knownImmutableClasses = [File])
    static class Config {
        String username
        String taskExecutorUsername
        String taskExecutorPassword
        String sepalUsername
        String sepalPassword
        String sepalEndpoint
        URI s3Endpoint
        URI googleEndpoint
        File workingDir
        int port

        static Config create(String configPath) {
            def c = new ConfigLoader(new File(configPath))
            new Config(
                    username: c.string('username'),
                    taskExecutorUsername: c.string('taskExecutorUsername'),
                    taskExecutorPassword: c.string('taskExecutorPassword'),
                    sepalUsername: c.string('sepalUsername'),
                    sepalPassword: c.string('sepalPassword'),
                    sepalEndpoint: c.string('sepalEndpoint'),
                    s3Endpoint: c.uri('s3Endpoint'),
                    googleEndpoint: c.uri('googleEndpoint'),
                    workingDir: c.file('workingDir'),
                    port: c.integer('port')
            )
        }
    }
}
