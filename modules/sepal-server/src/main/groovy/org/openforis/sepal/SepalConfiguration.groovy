package org.openforis.sepal

import com.mchange.v2.c3p0.ComboPooledDataSource
import org.openforis.sepal.util.FileSystem
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.sql.DataSource

class SepalConfiguration {
    private static Logger LOG = null

    public static final String WEBAPP_PORT_PARAMETER = 'webapp.port'
    public static final String JDBC_CONN_STRING_PARAMETER = 'jdbc.conn.string'
    public static final String JDBC_CONN_USER_PARAMETER = 'jdbc.conn.user'
    public static final String JDBC_CONN_PWD_PARAMETER = 'jdbc.conn.pwd'
    public static final String JDBC_DRIVER_PARAMETER = 'jdbc.driver'
    public static final String SANDBOX_PROXY_SESSION_TIMEOUT = 'sandbox.webproxy_session_timeout'

    Properties properties
    DataSource dataSource

    SepalConfiguration() {
        properties = new Properties()
        File file = new File(FileSystem.configDir(), 'sepal.properties')
        if (!file.exists())
            throw new IllegalArgumentException("configFileLocation must be an existing properties file. $file doesn't exist")
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
        LOG.info("Using config file $file")
        dataSource = connectionPool()
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

    String getVersion() {
        return getValue('version')
    }

    int getProxySessionTimeout() {
        Integer.parseInt(getValue(SANDBOX_PROXY_SESSION_TIMEOUT))
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

    String getGateOnePublicKey() {
        getValue('gateone.publicKey')
    }

    String getGateOnePrivateKey() {
        getValue('gateone.privateKey')
    }

    String getSepalUsername() {
        getValue('sepalUsername')
    }

    String getSepalPassword() {
        getValue('sepalPassword')
    }
    String getSepalHost() {
        getValue('sepal.host')
    }

    String getUserHomesDir() {
        getValue('sepal.userHomes')
    }

    String getValue(String key) {
        return properties.getProperty(key)
    }

    String getHostingService() {
        getValue('sepal.hostingService')
    }

    Map<String, Integer> getPortByProxiedEndpoint() {
        [
                'rstudio': 8787,
                'shiny': 3838,
        ]
    }

    @SuppressWarnings("GroovyAssignabilityCheck")
    void setEnv() {
        Set<String> keySet = properties.keySet()
        for (String key : keySet)
            System.setProperty(key, properties.get(key))
    }
}

