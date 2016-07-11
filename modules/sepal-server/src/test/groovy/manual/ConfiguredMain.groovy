package manual

import groovy.sql.Sql
import org.flywaydb.core.Flyway
import org.openforis.sepal.Main
import org.openforis.sepal.SepalConfiguration
import org.slf4j.Logger
import org.slf4j.LoggerFactory


class ConfiguredMain {
    static Logger LOG = LoggerFactory.getLogger(this)

    static void main(String[] args) {
        def config = new SepalConfiguration()
        LOG.info("Migrating database")
        def sql = new Sql(config.dataSource)
        sql.execute('''
                CREATE SCHEMA IF NOT EXISTS "public";
                CREATE ALIAS IF NOT EXISTS SPATIAL_INIT FOR
                    "org.h2gis.h2spatialext.CreateSpatialExtension.initSpatialExtension";
                CREATE ALIAS IF NOT EXISTS MAKEDATE FOR "fake.MySqlFunctions.makeDate";
                CREATE ALIAS IF NOT EXISTS STR_TO_DATE FOR "fake.MySqlFunctions.strToDate";
                CALL SPATIAL_INIT();''')
        new Flyway(
                locations: ["filesystem:modules/mysql/docker/script/sqlScripts"],
                dataSource: config.dataSource,
                schemas: ['PUBLIC']
        ).migrate()
        LOG.info("Starting Sepal")
        Main.main()
    }
}
