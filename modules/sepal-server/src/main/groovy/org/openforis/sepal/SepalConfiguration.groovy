package org.openforis.sepal

import com.mchange.v2.c3p0.ComboPooledDataSource
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.sql.DataSource

import static org.openforis.sepal.SepalWorkingMode.PRIVATE_LAN

class SepalConfiguration {
    private static Logger LOG = null

    public static final String MOUNTING_HOME_DIR_PARAMETER = 'mounting.homeDir'
    public static final String PROCESSING_CHAIN_PARAMETER = 'processing.chain'
    public static final String WEBAPP_PORT_PARAMETER = 'webapp.port'
    public static final String JDBC_CONN_STRING_PARAMETER = 'jdbc.conn.string'
    public static final String JDBC_CONN_USER_PARAMETER = 'jdbc.conn.user'
    public static final String JDBC_CONN_PWD_PARAMETER = 'jdbc.conn.pwd'
    public static final String JDBC_DRIVER_PARAMETER = 'jdbc.driver'
    public static final String MAX_CONCURRENT_DOWNLOADS = 'download.maxConcurrent'
    public static final String DOWNLOAD_CHECK_INTERVAL = 'download.checkInterval'
    public static final String EARTHEXPLORER_REST_ENDPOINT = 'earthexplorer.restEndpoint'
    public static final String EARTHEXPLORER_USERNAME = 'earthexplorer.username'
    public static final String EARTHEXPLORER_PASSWORD = 'earthexplorer.password'
    public static final String DOWNLOADS_WORKING_DIRECTORY = 'sepal.downloadWorkingDirectory'
    public static final String USER_HOME_DIR = 'sepal.userHomeDir'
    public static final String PROCESSING_HOME_DIR = 'sepal.processingChain.homeFolder'
    public static final String DOCKER_IMAGE_NAME = 'docker.imageName'
    public static final String DOCKER_BASE_URI = 'docker.baseURI'
    public static final String DOCKER_DAEMON_TCP_SCHEME = 'docker.tcpScheme'
    public static final String DOCKER_DAEMON_PORT = 'docker.daemonPort'
    public static final String DOCKER_REST_ENTRYPOINT = 'docker.restEntryPoint'
    public static final String CRAWLER_RUN_DELAY = 'metadata.crawler.delay'
    public static final String PUBLIC_HOME_DIR = 'sepal.publicHomeDir'
    public static final String SANBOX_PORTS_TO_CHECK = 'sepal.sandbox.healtCheckPorts'
    public static final String CONTAINER_INACTIVE_TIMEOUT = 'sandbox.inactive_timeout'
    public static final String DEAD_CONTAINERS_CHECK_INTERVAL = 'sandbox.garbage_check_interval'
    public static final String SANDBOX_MANAGER_JDBC_CONN_STRING = 'sandbox.jdbc_conn_string'
    public static final String SANBOX_PROXY_SESSION_TIMEOUT = 'sandbox.webproxy_session_timeout'
    public static final String ENVIRONMENT = 'environment'
    public static final String SEPAL_INSTANCES_CONFIG_FILE = 'sepal.instances_config_file'
    public static final String SEPAL_HOST = 'sepal.host'
    public static final String SANDBOX_INSTANCE_SECURITY_GROUP = 'sandbox.instance_security_group'
    public static final String SEPAL_WORKING_MODE = "sepal.working_mode"
    public static final String VERSION = "version"

    public static final String AWS_REGION = 'aws.region'
    public static final String AWS_AV_ZONE = 'aws.av_zone'
    public static final String AWS_ACCESS_KEY = 'aws.access_key'
    public static final String AWS_SECRET_KEY = 'aws.secret_key'

    Properties properties
    String configFileLocation
    DataSource dataSource
    DataSource sandboxDataSource

    SepalConfiguration() {}

    SepalConfiguration(String configFileLocation) {
        this.configFileLocation = configFileLocation
        properties = new Properties()
        File file = new File(configFileLocation)
        if (file.exists()) {
            FileInputStream fis = null
            try {
                fis = new FileInputStream(file)
                properties.load(fis)
                setEnv()

            } finally {
                if (fis != null) {
                    fis.close()
                }
            }
            LOG = LoggerFactory.getLogger(this.class)
            LOG.info("Using config file $configFileLocation")
            dataSource = connectionPool()
            sandboxDataSource = connectionPool(getSandboxJdbcConnString())
        }
    }

    private DataSource connectionPool(jdbcUrl = getJdbcConnectionString()) {
        new ComboPooledDataSource(
                driverClass: getJdbcDriver(),
                jdbcUrl: jdbcUrl,
                user: getJdbcUser(),
                password: getJdbcPassword(),
                testConnectionOnCheckout: true,
        )
    }

    SepalWorkingMode getSepalWorkingMode() {
        def workingMode = PRIVATE_LAN
        def workingModeRaw = getValue(SEPAL_WORKING_MODE)
        if (workingModeRaw) {
            workingMode = SepalWorkingMode.valueOf(workingModeRaw)
        }
        return workingMode
    }

    String getSepalVersion() { getValue(VERSION) }

    String getSandboxInstanceSecurityGroup() { getValue(SANDBOX_INSTANCE_SECURITY_GROUP) }

    String getSepalHost() { getValue(SEPAL_HOST) }

    String getSepalInstancesConfigFile() { getValue(SEPAL_INSTANCES_CONFIG_FILE) }

    String getEnvironment() { getValue(ENVIRONMENT) }

    int getProxySessionTimeout() {
        Integer.parseInt(getValue(SANBOX_PROXY_SESSION_TIMEOUT))
    }

    int getContainerInactiveTimeout() {
        Integer.parseInt(getValue(CONTAINER_INACTIVE_TIMEOUT))
    }

    int getDeadContainersCheckInterval() {
        Integer.parseInt(getValue(DEAD_CONTAINERS_CHECK_INTERVAL))
    }

    String getSandboxJdbcConnString() {
        getValue(SANDBOX_MANAGER_JDBC_CONN_STRING)
    }

    String getSandboxPortsToCheck() {
        getValue(SANBOX_PORTS_TO_CHECK)
    }

    String getPublicHomeDir() {
        getValue(PUBLIC_HOME_DIR)
    }

    long getCrawlerRunDelay() {
        Long.parseLong(getValue(CRAWLER_RUN_DELAY))
    }

    String getDockerRESTEntryPoint() {
        getValue(DOCKER_REST_ENTRYPOINT)
    }

    int getDockerDaemonPort() {
        def portValue = getValue(DOCKER_DAEMON_PORT)
        return portValue ? Integer.parseInt(portValue) : 2375
    }

    String getDockerDaemonTcpScheme() { getValue(DOCKER_DAEMON_TCP_SCHEME) }

    String getDockerImageName() {
        getValue(DOCKER_IMAGE_NAME)
    }

    String getDockerDaemonURI(String baseURI) {
        getDockerDaemonTcpScheme() + "://" + baseURI + ':' + getDockerDaemonPort() + '/' + getDockerRESTEntryPoint()
    }

    String getProcessingHomeDir() {
        getValue(PROCESSING_HOME_DIR)
    }

    String getUserHomeDir() {
        getValue(USER_HOME_DIR)
    }

    String getDownloadWorkingDirectory() {
        getValue(DOWNLOADS_WORKING_DIRECTORY)
    }

    String getEarthExplorerUsername() {
        getValue(EARTHEXPLORER_USERNAME)
    }

    String getEarthExplorerPassword() {
        getValue(EARTHEXPLORER_PASSWORD)
    }

    String getEarthExplorerRestEndpoint() {
        getValue(EARTHEXPLORER_REST_ENDPOINT)
    }

    long getDownloadCheckInterval() {
        Long.parseLong(getValue(DOWNLOAD_CHECK_INTERVAL))
    }

    int getMaxConcurrentDownloads() {
        Integer.parseInt(getValue(MAX_CONCURRENT_DOWNLOADS))
    }

    String getJdbcDriver() {
        getValue(JDBC_DRIVER_PARAMETER)
    }

    String getJdbcConnectionString() {
        getValue(JDBC_CONN_STRING_PARAMETER)
    }

    String getJdbcUser() {
        getValue(JDBC_CONN_USER_PARAMETER)
    }

    String getJdbcPassword() {
        getValue(JDBC_CONN_PWD_PARAMETER)
    }

    int getWebAppPort() {
        Integer.parseInt(getValue(WEBAPP_PORT_PARAMETER))
    }

    String getMountingHomeDir() {
        getValue(MOUNTING_HOME_DIR_PARAMETER)
    }

    String getProcessingChain() {
        getValue(PROCESSING_CHAIN_PARAMETER)
    }


    String getAwsAccessKey() { getValue(AWS_ACCESS_KEY) }

    String getAwsSecretKey() { getValue(AWS_SECRET_KEY) }

    String getRegion() { getValue(AWS_REGION) }

    String getAvailabilityZone() { getValue(AWS_AV_ZONE) }


    String getLdapHost() {
        getValue('ldap.host')
    }

    String getLdapPassword() {
        getValue('ldap.password')
    }

    String getValue(String key) {
        return properties.getProperty(key)
    }

    void setEnv() {
        Set<String> keySet = properties.keySet()
        for (String key : keySet)
            System.setProperty(key, properties.get(key))
    }

    String getHostingService() {
        getValue('sepal.hostingService')
    }
}

enum SepalWorkingMode {
    MONOLITICH, PUBLIC_WAN, PRIVATE_LAN
}
