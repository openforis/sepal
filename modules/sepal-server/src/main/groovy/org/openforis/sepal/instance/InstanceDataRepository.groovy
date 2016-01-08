package org.openforis.sepal.instance

import groovy.sql.Sql
import org.openforis.sepal.session.InvalidInstance
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.Instance.Status.AVAILABLE

interface InstanceDataRepository {


    DataCenter getDataCenterById(long dataCenterId)


    Instance fetchInstanceByNameAndDataCenter(String name, DataCenter dataCenter)

    /*
        New methods
     */

    Boolean updateInstance(Instance instance)

    long newInstance(Instance instance)

    InstanceType fetchInstanceTypeById(Long instanceTypeId)

    Instance findAvailableInstance(DataCenter dataCenter, Long instanceTypeId)

    List<InstanceType> findAvailableInstanceTypes(Long providerId)

    InstanceType fetchInstanceTypeByProviderAndName(InstanceProvider provider, String name)

    Instance fetchInstanceById(long instanceId)

    DataCenter getDataCenterByName(String dataCenterName)

}

class JdbcInstanceDataRepository implements InstanceDataRepository {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SqlConnectionProvider connectionProvider

    JdbcInstanceDataRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    @Override
    List<InstanceType> findAvailableInstanceTypes(Long providerId) {
        def list = []
        sql.eachRow('''SELECT type.id AS typeId, type.name AS typeName, type.description AS typeDescription, type.hourly_costs AS typeHourlyCost, type.cpu_count AS typeCpuCount,
                     type.ram AS typeRam,type.notes AS typeNotes, type.enabled AS typeEnabled FROM instance_types type WHERE type.provider_id = ? ORDER BY type.hourly_costs ASC''',
                [providerId]) {
            list.add(mapInstanceType(it))
        }
        return list
    }

    @Override
    InstanceType fetchInstanceTypeById(Long instanceTypeId) {
        def row = sql.firstRow('''SELECT type.id AS typeId, type.name AS typeName, type.description AS typeDescription, type.hourly_costs AS typeHourlyCost, type.cpu_count AS typeCpuCount,
                    type.ram AS typeRam,type.notes AS typeNotes, type.enabled AS typeEnabled FROM instance_types type WHERE type.id = ? ''',
                [instanceTypeId])

        if (!row) {
            throw new InvalidInstance("Unknow instance typeId $instanceTypeId")
        }
        return mapInstanceType(row)
    }

    @Override
    InstanceType fetchInstanceTypeByProviderAndName(InstanceProvider provider, String name) {
        def row = sql.firstRow('''SELECT type.id AS typeId, type.name AS typeName, type.description AS typeDescription, type.hourly_costs AS typeHourlyCost, type.cpu_count AS typeCpuCount,
                    type.ram AS typeRam,type.notes AS typeNotes, type.enabled AS typeEnabled FROM instance_types type WHERE type.provider_id = ? AND UPPER(type.name) = ? ORDER BY typeHourlyCost ASC''',
                [provider?.id, name?.toUpperCase()])
        if (!row) {
            throw new InvalidInstance("Unknow tpye $name for provider $providerId")
        }
        return mapInstanceType(row)
    }

    @Override
    Instance fetchInstanceById(long instanceId) {
        def row = sql.firstRow('SELECT * FROM v_instances WHERE icId = ?', [instanceId])
        if (!row) {
            throw new InvalidInstance("Instance $instanceId not found on the data repository")
        }
        return mapInstance(row)
    }

    @Override
    DataCenter getDataCenterByName(String dataCenterName) {
        def sqlQuery = '''SELECT dc.id AS dcId, dc.name AS dcName, dc.geolocation AS dcGeoLocation, dc.description AS dcDescription,
                          pr.id AS prId, pr.name AS prName, pr.description AS prDescription
                          FROM datacenters dc INNER JOIN instance_providers pr ON dc.provider_id = pr.id
                          WHERE dc.name = ?'''
        def row = sql.firstRow(sqlQuery, [dataCenterName])
        return row ? mapDataCenter(row) : null
    }

    @Override
    DataCenter getDataCenterById(long dataCenterId) {
        def sqlQuery = '''SELECT dc.id AS dcId, dc.name AS dcName, dc.geolocation AS dcGeoLocation, dc.description AS dcDescription,
                          pr.id AS prId, pr.name AS prName, pr.description AS prDescription
                          FROM datacenters dc INNER JOIN instance_providers pr ON dc.provider_id = pr.id
                          WHERE dc.id = ?'''
        def row = sql.firstRow(sqlQuery, [dataCenterId])
        return row ? mapDataCenter(row) : null
    }


    @Override
    Instance findAvailableInstance(DataCenter dataCenter, Long instanceTypeId) {
        def row = sql.firstRow('SELECT * FROM v_instances WHERE dcId = ? AND typeId = ? AND icOwner IS NULL AND icStatus = ?', [dataCenter?.id, instanceTypeId, AVAILABLE.name()])
        return row ? mapInstance(row) : null
    }

    @Override
    Instance fetchInstanceByNameAndDataCenter(String name, DataCenter dataCenter) {
        name = name ?: ''
        def row = sql.firstRow('SELECT * FROM v_instances WHERE UPPER(icName) = ? AND dcId = ?', [name.toUpperCase(), dataCenter?.id])
        return row ? mapInstance(row) : null
    }


    @Override
    Boolean updateInstance(Instance instance) {
        instance?.statusUpdateTime = new Date()
        def affectedRows = sql.executeUpdate(
                'UPDATE instances SET status =?, public_ip = ?, private_ip = ?,termination_time = ?, status_update_time = ?,owner = ? WHERE id = ?',
                [instance?.status?.name(), instance?.publicIp, instance?.privateIp, instance?.terminationTime, instance?.statusUpdateTime, instance?.owner, instance?.id]
        )
        return affectedRows > 0
    }

    @Override
    long newInstance(Instance instance) {
        def results = sql.executeInsert('''
            INSERT INTO instances (status,public_ip,private_ip,owner,name,launch_time,termination_time,status_update_time,data_center_id,instance_type)
            VALUES(?,?,?,?,?,?,?,?,?,?)''',
                [instance?.status?.name(), instance?.publicIp, instance?.privateIp, instance?.owner, instance?.name, instance?.launchTime,
                 instance?.terminationTime, instance?.statusUpdateTime, instance?.dataCenter?.id, instance?.instanceType?.id])
        return results[0][0]
    }


    private static Instance mapInstance(row) {
        new Instance(
                id: row.icId, status: Instance.Status.valueOf(row.icStatus), publicIp: row.icPublicIp, privateIp: row.icPrivateIp,
                owner: row.icOwner, name: row.icName, launchTime: row.icLaunchTime, terminationTime: row.icDateEnd, statusUpdateTime: row.icUpdateTime,
                dataCenter: mapDataCenter(row), instanceType: mapInstanceType(row))
    }


    private static DataCenter mapDataCenter(row) {

        new DataCenter(provider: mapProvider(row), id: row.dcId, name: row.dcName, geolocation: row.dcGeoLocation, description: row.dcDescription)
    }

    private static InstanceProvider mapProvider(def row) {
        new InstanceProvider(id: row.prId, name: row.prName, description: row.prDescription)
    }

    private static InstanceType mapInstanceType(def row) {
        new InstanceType(
                id: row.typeId, name: row.typeName, description: row.typeDescription, hourlyCosts: row.typeHourlyCost,
                cpuCount: row.typeCpuCount, ramMemory: row.typeRam, notes: row.typeNotes, enabled: row.typeEnabled
        )
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}


