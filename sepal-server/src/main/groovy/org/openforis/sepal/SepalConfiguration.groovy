package org.openforis.sepal

import com.mchange.v2.c3p0.ComboPooledDataSource
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.sql.DataSource

@Singleton
class SepalConfiguration {
    private static Logger LOG = null

    public static final String MOUNTING_HOME_DIR_PARAMETER = "mounting.homeDir"
    public static final String HOME_DIR_PARAMETER = "home.dir"
    public static final String TARGET_DIR_PARAMETER = "target.dir"
    public static final String PROCESSING_CHAIN_PARAMETER = "processing.chain"
    public static final String STYLE_PARAMETER = "style"
    public static final String LAYER_FOLDER_NAME_PARAMETER = "layer.folder.name"
    public static final String GEOSERVER_URL_PARAMETER = "geoserver.url"
    public static final String GEOSERVER_USER_PARAMETER = "geoserver.user"
    public static final String GEOSERVER_PWD_PARAMETER = "geoserver.pwd"
    public static final String WEBAPP_PORT_PARAMETER = "webapp.port"
    public static final String JDBC_CONN_STRING_PARAMETER = "jdbc.conn.string"
    public static final String JDBC_CONN_USER_PARAMETER = "jdbc.conn.user"
    public static final String JDBC_CONN_PWD_PARAMETER = "jdbc.conn.pwd"
    public static final String JDBC_DRIVER_PARAMETER = "jdbc.driver"
    public static final String MAX_CONCURRENT_DOWNLOADS = "download.maxConcurrent"
    public static final String DOWNLOAD_CHECK_INTERVAL = "download.checkInterval"
    public static final String EARTHEXPLORER_REST_ENDPOINT = "earthexplorer.restEndpoint"
    public static final String EARTHEXPLORER_USERNAME = "earthexplorer.username"
    public static final String EARTHEXPLORER_PASSWORD = "earthexplorer.password"
    public static final String DOWNLOADS_WORKING_DIRECTORY = "sepal.downloadWorkingDirectory"
    public static final String USER_HOME_DIR = "sepal.userHomeDir"
    public static final String PROCESSING_HOME_DIR = "sepal.processingChain.homeFolder"
    public static final String DOCKER_IMAGE_NAME = "docker.imageName"
    public static final String DOCKER_BASE_URI = "docker.baseURI"
    public static final String DOCKER_DAEMON_PORT = "docker.daemonPort"
    public static final String DOCKER_REST_ENTRYPOINT = "docker.restEntryPoint"
    public static final String CRAWLER_RUN_DELAY = "metadata.crawler.delay"
    public static final String USER_CREDENTIALS_HOME_DIR = "user.credentials.homeDir"
    public static final String PUBLIC_HOME_DIR = "sepal.publicHomeDir"
    public static final String SANBOX_PORTS_TO_CHECK = "sepal.sandbox.healtCheckPorts"
    public static final String CONTAINER_INACTIVE_TIMEOUT = "sandbox.inactive_timeout"
    public static final String DEAD_CONTAINERS_CHECK_INTERVAL = "sandbox.garbage_check_interval"
    public static final String SANDBOX_MANAGER_JDBC_CONN_STRING = "sandbox.jdbc_conn_string"

    Properties properties
    String configFileLocation
    DataSource dataSource
    DataSource sandboxDataSource

    def setConfigFileLocation(String configFileLocation) {

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
            sandboxDataSource =connectionPool(getSandboxJdbcConnString())
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

    def getContainerInactiveTimeout(){
        Integer.parseInt(getValue(CONTAINER_INACTIVE_TIMEOUT))
    }

    def getDeadContainersCheckInterval(){
        Integer.parseInt(getValue(DEAD_CONTAINERS_CHECK_INTERVAL))
    }

    def getSandboxJdbcConnString(){
        getValue(SANDBOX_MANAGER_JDBC_CONN_STRING)
    }

    def getSandboxPortsToCheck(){
        getValue(SANBOX_PORTS_TO_CHECK)
    }

    def getPublicHomeDir() {
        getValue(PUBLIC_HOME_DIR)
    }

    def getUserCredentialsHomeDir() {
        getValue(USER_CREDENTIALS_HOME_DIR)
    }

    def getCrawlerRunDelay() {
        Long.parseLong(getValue(CRAWLER_RUN_DELAY))
    }

    def getDockerRESTEntryPoint() {
        getValue(DOCKER_REST_ENTRYPOINT)
    }

    def getDockerDaemonPort() {
        def portValue = getValue(DOCKER_DAEMON_PORT)
        return portValue ? Integer.parseInt(portValue) : 2375
    }

    def getDockerBaseURI() {
        getValue(DOCKER_BASE_URI)
    }


    def getDockerImageName() {
        getValue(DOCKER_IMAGE_NAME)
    }

    def getDockerDaemonURI() { getDockerBaseURI() + ':' + getDockerDaemonPort() + '/' + getDockerRESTEntryPoint() }

    def getProcessingHomeDir() {
        getValue(PROCESSING_HOME_DIR)
    }

    def getUserHomeDir() {
        getValue(USER_HOME_DIR)
    }


    def getDownloadWorkingDirectory() {
        getValue(DOWNLOADS_WORKING_DIRECTORY)
    }

    def getEarthExplorerUsername() {
        getValue(EARTHEXPLORER_USERNAME)
    }

    def getEarthExplorerPassword() {
        getValue(EARTHEXPLORER_PASSWORD)
    }

    def getEarthExplorerRestEndpoint() {
        getValue(EARTHEXPLORER_REST_ENDPOINT)
    }

    def getDownloadCheckInterval() {
        Long.parseLong(getValue(DOWNLOAD_CHECK_INTERVAL))
    }

    def getMaxConcurrentDownloads() {
        Integer.parseInt(getValue(MAX_CONCURRENT_DOWNLOADS))
    }

    def getJdbcDriver() {
        getValue(JDBC_DRIVER_PARAMETER)
    }

    def getJdbcConnectionString() {
        getValue(JDBC_CONN_STRING_PARAMETER)
    }

    def getJdbcUser() {
        getValue(JDBC_CONN_USER_PARAMETER)
    }

    def getJdbcPassword() {
        getValue(JDBC_CONN_PWD_PARAMETER)
    }

    def getWebAppPort() {
        Integer.parseInt(getValue(WEBAPP_PORT_PARAMETER))
    }

    def getHomeDir() {
        getValue(HOME_DIR_PARAMETER)
    }

    def getMountingHomeDir() {
        getValue(MOUNTING_HOME_DIR_PARAMETER)
    }

    def getTargetDir() {
        getValue(TARGET_DIR_PARAMETER)
    }

    def getProcessingChain() {
        getValue(PROCESSING_CHAIN_PARAMETER)
    }

    def getStyle() {
        getValue(STYLE_PARAMETER)
    }

    def getLayerFolderName() {
        getValue(LAYER_FOLDER_NAME_PARAMETER)
    }

    def getGeoServerUrl() {
        getValue(GEOSERVER_URL_PARAMETER)
    }

    def getGeoServerUser() {
        getValue(GEOSERVER_USER_PARAMETER)
    }

    def getGeoServerPwd() {
        getValue(GEOSERVER_PWD_PARAMETER)
    }


    def getValue(String key) {
        return properties.getProperty(key)
    }

    def setEnv() {
        Set<String> keySet = properties.keySet()
        for (String key : keySet) {
            System.setProperty(key, properties.get(key))
        }
    }


}
