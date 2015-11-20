package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.instance.*
import org.openforis.sepal.sandbox.JDBCSandboxDataRepository
import org.openforis.sepal.sandbox.SandboxDataRepository
import org.openforis.sepal.sandbox.Size
import spock.lang.Shared
import spock.lang.Specification

import static org.openforis.sepal.instance.Instance.Capacity.*
import static org.openforis.sepal.instance.Instance.Status.*

class InstanceDataRepositoryTest extends Specification{

    private static final String PUBLIC_IP_ALTERNATIVE = "A_PUBLIC_IP"
    private static final String PRIVATE_IP_ALTERNATIVE = "A_PRIVATE_IP"
    private static final String STATUS_ALTERNATIVE = NA


    @Shared SepalDriver driver

    InstanceDataRepository dataRepo
    SandboxDataRepository sandboxDataRepo

    InstanceProvider provider2
    InstanceProvider provider1
    DataCenter dataCenter1
    DataCenter dataCenter2
    DataCenter dataCenter3
    Instance instance1
    Instance instance2
    Instance instance3
    Instance instance4

    def setupSpec(){
        driver = new SepalDriver()
    }

    def cleanupSpec(){
        driver?.stop()
    }

    def setup(){
        dataRepo = new JdbcInstanceDataRepository(driver.getSQLManager())
        sandboxDataRepo = new JDBCSandboxDataRepository(driver.getSQLManager())

        provider1 = new InstanceProvider(name: 'Provider1', description: 'Provider1')
        provider2 = new InstanceProvider(name: 'Provider2', description: 'Provider2')
        dataCenter1 = new DataCenter(name: 'DC1',geolocation: 'Asia', description: 'DC1_DESCR', provider: provider1)
        dataCenter2 = new DataCenter(name: 'DC2',geolocation: 'America', description: 'DC2_DESCR', provider: provider1)
        dataCenter3 = new DataCenter(name: 'DC3',geolocation: 'Europe', description: 'DC3_DESCR', provider: provider2)

        instance1 = new Instance(
                status: AVAILABLE,publicIp: 'ip1',privateIp: 'pr1', owner: 'own1', name: 'nm1', launchTime: new Date(), statusUpdateTime: new Date(), disposable: true,reserved: false,
                capacity: SMALL, dataCenter: dataCenter1, terminationTime: new Date()
        )
        instance2 = new Instance(
                status: CREATED,publicIp: 'ip2',privateIp: 'pr2', owner: 'own2', name: 'nm2', launchTime: new Date(), statusUpdateTime: new Date(), disposable: false,reserved: true,
                capacity: MEDIUM, dataCenter: dataCenter2, terminationTime: new Date()
        )
        instance3 = new Instance(
                status: AVAILABLE,publicIp: 'ip3',privateIp: 'pr3', owner: 'own3', name: 'nm3', launchTime: new Date(), statusUpdateTime: new Date(), disposable: true,reserved: false,
                capacity: LARGE, dataCenter: dataCenter3, terminationTime: new Date()
        )

        instance4 = new Instance(
                status: AVAILABLE,publicIp: 'ip4',privateIp: 'pr4', owner: 'own4', name: 'nm4', launchTime: new Date(), statusUpdateTime: new Date(), disposable: false,reserved: true,
                capacity: XLARGE, dataCenter: dataCenter1, terminationTime: new Date()
        )


    }

    def cleanup(){
        driver.resetDatabase()
    }

    def 'testing the correct behaviour of the method getDataCenterByName()'(){
        given:
        driver.withInstanceProvider(provider1)
        dataCenter1.provider = provider1
        driver.withDataCenter(dataCenter1)
        when:
        def firstDataCenter = dataRepo.getDataCenterByName('SOME_STRING')
        def secondDataCenter = dataRepo.getDataCenterByName(dataCenter1.name)
        then:
        !firstDataCenter
        secondDataCenter
        secondDataCenter.name == dataCenter1.name
        secondDataCenter.description == dataCenter1.description
        secondDataCenter.geolocation == dataCenter1.geolocation
        secondDataCenter.provider.id == provider1.id
        secondDataCenter.provider.name == provider1.name
        secondDataCenter.provider.description == provider1.description
    }

    def 'testing the correct behaviour of the method getDataCenterById()'(){
        given:
        driver.withInstanceProvider(provider1)
        dataCenter1.provider = provider1
        driver.withDataCenter(dataCenter1)
        when:
        def firstDataCenter = dataRepo.getDataCenterById(Random.newInstance().nextLong())
        def secondDataCenter = dataRepo.getDataCenterById(dataCenter1.id)
        then:
        !firstDataCenter
        secondDataCenter
        secondDataCenter.name == dataCenter1.name
        secondDataCenter.description == dataCenter1.description
        secondDataCenter.geolocation == dataCenter1.geolocation
        secondDataCenter.provider.id == provider1.id
        secondDataCenter.provider.name == provider1.name
        secondDataCenter.provider.description == provider1.description
    }



    def 'testing the correct behavior of the insert/update/select methods'(){
        given:
        driver.withInstanceProviders(provider1,provider2)
        dataCenter1.provider = provider1
        dataCenter2.provider = provider1
        dataCenter3.provider = provider2
        driver.withDataCenters(dataCenter1,dataCenter2,dataCenter3)
        instance1.id = dataRepo.newInstance(instance1)
        instance2.id = dataRepo.newInstance(instance2)
        instance3.id = dataRepo.newInstance(instance3)
        instance4.id = dataRepo.newInstance(instance4)
        when:
        def fetchedInstance1 = dataRepo.fetchInstanceById(instance1.id)
        def fetchedInstance2 = dataRepo.fetchInstanceById(instance2.id)
        def fetchedInstance3 = dataRepo.fetchInstanceById(instance3.id)
        def fetchedInstance4 = dataRepo.fetchInstanceById(instance4.id)
        def fetchedInstanceByName = dataRepo.fetchInstanceByNameAndDataCenter(fetchedInstance4.name, fetchedInstance4.dataCenter)
        def unFetchedInstanceByName = dataRepo.fetchInstanceByNameAndDataCenter(fetchedInstance4.name, fetchedInstance3.dataCenter)
        def notFound = dataRepo.fetchInstanceById(3455L)
        instance1.status = STATUS_ALTERNATIVE
        instance2.publicIp = PUBLIC_IP_ALTERNATIVE
        instance3.privateIp = PRIVATE_IP_ALTERNATIVE
        instance4.terminationTime = new Date()
        instance1.statusUpdateTime = new Date()
        def affected1 = dataRepo.updateInstance(instance1)
        def affected2 = dataRepo.updateInstance(instance2)
        def affected3 = dataRepo.updateInstance(instance3)
        def affected4 = dataRepo.updateInstance(instance4)
        def notAffected = dataRepo.updateInstance(new Instance(id: 5678L))
        def reFetchedInstance1 = dataRepo.fetchInstanceById(instance1.id)
        def reFetchedInstance2 = dataRepo.fetchInstanceById(instance2.id)
        def reFetchedInstance3 = dataRepo.fetchInstanceById(instance3.id)
        def reFetchedInstance4 = dataRepo.fetchInstanceById(instance4.id)

        then:
        fetchedInstance1 && fetchedInstance2 && fetchedInstance3 && fetchedInstance4 && !notFound
        fetchedInstance1.dataCenter.id == instance1.dataCenter.id
        fetchedInstance2.status == instance2.status
        fetchedInstance3.publicIp == instance3.publicIp
        fetchedInstance4.privateIp == instance4.privateIp
        fetchedInstance1.owner == instance1.owner
        fetchedInstance2.name == instance2.name
        fetchedInstance3.launchTime == instance3.launchTime
        fetchedInstance3.terminationTime == instance3.terminationTime
        fetchedInstance2.disposable == instance2.disposable
        fetchedInstance3.reserved == instance3.reserved
        fetchedInstance4.capacity == instance4.capacity
        fetchedInstanceByName
        !unFetchedInstanceByName
        reFetchedInstance1 && reFetchedInstance2 && reFetchedInstance3 && reFetchedInstance4
        affected1 && affected2 && affected3 && affected4 && !(notAffected)
        reFetchedInstance1.status == instance1.status
        reFetchedInstance2.publicIp == instance2.publicIp
        reFetchedInstance3.privateIp == instance3.privateIp
        reFetchedInstance4.terminationTime == instance4.terminationTime
    }

    def 'testing the correct behavior of the findAvailableInstance() method'(){
        given:
        driver.withInstanceProvider(provider1)
        dataCenter1.provider = provider1
        dataCenter2.provider = provider1
        driver.withDataCenters(dataCenter1,dataCenter2)
        instance1.id = dataRepo.newInstance(instance1)
        instance2.id = dataRepo.newInstance(instance2)
        instance4.id = dataRepo.newInstance(instance4)
        when:


        def instance = dataRepo.findAvailableInstance(Size.SMALL.value,dataCenter1)

        def bigInstance = dataRepo.findAvailableInstance(Size.XLARGE.value,dataCenter1)
        instance4.owner = null
        dataRepo.updateInstance(instance4)
        def bigInstance2 = dataRepo.findAvailableInstance(Size.XLARGE.value,dataCenter1)

        def sandbox1 =sandboxDataRepo.requested('owner4',instance4.id,Size.LARGE)
        def largeInstance = dataRepo.findAvailableInstance(Size.LARGE.value,dataCenter1)
        def sandbox2 =sandboxDataRepo.requested('owner42',instance4.id,Size.LARGE)
        def largeInstance2 = dataRepo.findAvailableInstance(Size.LARGE.value,dataCenter1)



        def sandbox3 = sandboxDataRepo.requested('owner43',instance1.id,Size.SMALL)
        def smallInstance = dataRepo.findAvailableInstance(Size.SMALL.value,dataCenter1)

        sandboxDataRepo.terminated(sandbox1)
        sandboxDataRepo.terminated(sandbox2)
        def xLargeInstance = dataRepo.findAvailableInstance(Size.XLARGE.value,dataCenter1)
        sandboxDataRepo.requested('owner43',instance4.id,Size.LARGE)
        def smallInstance2 = dataRepo.findAvailableInstance(Size.SMALL.value,dataCenter1)


        sandboxDataRepo.terminated(sandbox3)
        def smallInstance3 = dataRepo.findAvailableInstance(Size.SMALL.value,dataCenter1)

        then:
        instance
        instance.id == instance1.id
        !bigInstance
        bigInstance2 && bigInstance2.id == instance4.id
        largeInstance && largeInstance.id == instance4.id
        !largeInstance2
        !smallInstance
        xLargeInstance && xLargeInstance.id == instance4.id
        smallInstance2 && smallInstance2.id == instance4.id
        smallInstance3 && smallInstance3.id == instance1.id

    }





}
