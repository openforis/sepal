package org.openforis.sepal.instance

import groovy.sql.Sql
import org.openforis.sepal.instance.Instance.Capacity
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.Instance.Status.AVAILABLE



interface InstanceDataRepository {

    DataCenter getDataCenterByName(String dataCenterName)

    DataCenter getDataCenterById( long dataCenterId )

    Boolean updateInstance ( Instance instance )

    long newInstance ( Instance instance)

    Instance fetchInstanceById(long instanceId )

    Instance fetchInstanceByNameAndDataCenter(String name, DataCenter dataCenter)

    Instance findAvailableInstance ( long sandboxSize, DataCenter dataCenter)

}

class JdbcInstanceDataRepository implements InstanceDataRepository{

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SqlConnectionProvider connectionProvider

    JdbcInstanceDataRepository(SqlConnectionProvider connectionProvider){
        this.connectionProvider = connectionProvider
    }

    @Override
    DataCenter getDataCenterByName(String dataCenterName) {
        def sqlQuery = '''SELECT dc.id,dc.name,dc.geolocation,dc.description,
                          ip.id as ipId,ip.name as ipName,ip.description as ipDescr
                          FROM datacenters dc INNER JOIN instance_providers ip ON dc.provider_id = ip.id
                          WHERE dc.name = ?'''
        def row = sql.firstRow(sqlQuery,[dataCenterName])
        return row ? mapDataCenter(row) : null
    }

    @Override
    DataCenter getDataCenterById(long dataCenterId) {
        def sqlQuery = '''SELECT dc.id,dc.name,dc.geolocation,dc.description,
                          ip.id as ipId,ip.name as ipName,ip.description as ipDescr
                          FROM datacenters dc INNER JOIN instance_providers ip ON dc.provider_id = ip.id
                          WHERE dc.id = ?'''
        def row = sql.firstRow(sqlQuery,[dataCenterId])
        return row ? mapDataCenter(row) : null
    }

    @Override
    Boolean updateInstance(Instance instance) {
        instance?.statusUpdateTime = new Date()
        def affectedRows = sql.executeUpdate(
                'UPDATE instances SET status =?, public_ip = ?, private_ip = ?,termination_time = ?, status_update_time = ?,owner = ? WHERE id = ?',
                [instance?.status?.name(),instance?.publicIp, instance?.privateIp, instance?.terminationTime, instance?.statusUpdateTime,instance?.owner,instance?.id]
        )
        return affectedRows > 0
    }

    @Override
    long newInstance(Instance instance) {
        def results = sql.executeInsert('''
            INSERT INTO instances (status,public_ip,private_ip,owner,name,launch_time,termination_time,status_update_time,disposable,reserved,data_center_id,capacity)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
                [instance?.status?.name(), instance?.publicIp,instance?.privateIp, instance?.owner, instance?.name, instance?.launchTime,
                 instance?.terminationTime, instance?.statusUpdateTime,instance?.disposable,instance?.reserved, instance?.dataCenter?.id, instance?.capacity?.value])
        return results[0][0]
    }

    @Override
    Instance fetchInstanceById(long instanceId) {
        def row = sql.firstRow(getSelectFromStatement() + ' WHERE ic.id = ?',[instanceId])
        return row ? mapInstance(row) : null
    }

    @Override
    Instance fetchInstanceByNameAndDataCenter(String name, DataCenter dataCenter) {
        name = name?: ''
        def row = sql.firstRow(getSelectFromStatement() + ' WHERE UPPER(ic.name) = ? AND dc.id = ?',[name.toUpperCase(),dataCenter?.id])
        return row ? mapInstance(row) : null
    }

    @Override
    Instance findAvailableInstance(long sandboxSize, DataCenter dataCenter) {
        def row = sql.firstRow(
                ' SELECT * FROM instances_status WHERE dataCenterId = ? AND remaining >= ? AND (instanceReserved = ? OR instanceOwner IS NULL) AND instanceStatus = ?'
                ,[dataCenter?.id,sandboxSize,0,AVAILABLE.name()])
        return row ? fetchInstanceById(row.instanceIdentifier) : null
    }

    private static String getSelectFromStatement(){
        def sb = new StringBuilder('SELECT ic.id AS icId, ic.status AS icStatus, ic.public_ip AS icPublicIp, ic.private_ip AS icPrivateIp, ic.owner AS icOwner, ic.name AS icName, ')
        sb.append('ic.launch_time AS icLaunchTime, ic.termination_time AS icDateEnd, ic.status_update_time AS icUpdateTime, ic.disposable AS icDisposable, ic.reserved AS icReserved,ic.capacity AS icCapacity ')
        sb.append(',dc.id AS dcId, dc.name AS dcName, dc.geolocation AS dcGeoLocation, dc.description AS dcDescription, ')
        sb.append('pr.id AS prId, pr.name AS prName, pr.description AS prDescription ')
        sb.append('FROM instances ic INNER JOIN datacenters dc ON ic.data_center_id = dc.id ')
        sb.append('INNER JOIN instance_providers pr ON dc.provider_id = pr.id ')
        return sb.toString()
    }

    private static Instance mapInstance(def row){
        def instance = new Instance(
                id: row.icId,  status: Instance.Status.valueOf(row.icStatus), publicIp: row.icPublicIp, privateIp: row.icPrivateIp,
                owner: row.icOwner, name: row.icName, launchTime: row.icLaunchTime, terminationTime: row.icDateEnd, statusUpdateTime: row.icUpdateTime,
                disposable: row.icDisposable, reserved: row.icReserved, capacity: Capacity.fromValue(row.icCapacity))
        instance.dataCenter = new DataCenter(id: row.dcId, name: row.dcName, geolocation: row.dcGeoLocation, description: row.dcDescription)
       instance.dataCenter.provider = new InstanceProvider(id: row.prId, name: row.prName, description: row.prDescription)
        return instance
    }



    private static DataCenter mapDataCenter (def row){
        def provider = new InstanceProvider(id: row.ipId, name: row.ipName, description: row.ipDescr)
        return new DataCenter( provider: provider, id: row.id, name: row.name, geolocation: row.geolocation, description: row.description )
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}


