package unit.instance

import org.openforis.sepal.instance.*
import org.openforis.sepal.transaction.SqlConnectionManager
import spock.lang.Specification

import static org.openforis.sepal.instance.Instance.Status.AVAILABLE
import static org.openforis.sepal.instance.Instance.Status.TERMINATED

class InstanceManagerTest extends Specification{

    private static final String ENVIRONMENT = 'Commit Stage'

    InstanceManager instanceManager
    InstanceDataRepository instanceDataRepository
    DataCenter dataCenter
    InstanceProvider icProvider = new InstanceProvider(id: 1, name: 'AWS')
    StubProviderManager providerManager

    def setup(){

        instanceDataRepository = Spy(JdbcInstanceDataRepository, constructorArgs: [Mock(SqlConnectionManager)])
        providerManager = new StubProviderManager()
        dataCenter = new DataCenter(id: 1, name: 'A_DATA_CENTER', geolocation: 'SOUTH_EAST', description: 'DC_DESCR',provider: icProvider)
        instanceManager = new ConcreteInstanceManager(
                instanceDataRepository,
                dataCenter,
                ENVIRONMENT,
                providerManager
        )
    }

    def 'the .bootstrap() happy path behaves correctly'(){
        given:
        def file = InstanceManagerTest.getResource('/instances.yml').file
        when:
        instanceManager.bootstrap(file)
        then:
        providerManager.gatherFactsInvocations == 2
        2 * instanceDataRepository.fetchInstanceByNameAndDataCenter(_ as String, _ as DataCenter) >>>  [new Instance(),null]
        1 * instanceDataRepository.newInstance(_) >> 1L
    }


    def 'the .bootstrap() sad path behaves correctly'(){
        given:
        def file = InstanceManagerTest.getResource('/instances_sad_path.yml').file
        when:
        instanceManager.bootstrap(file)
        then:
        providerManager.gatherFactsInvocations == 1
        0 * instanceDataRepository.fetchInstanceByNameAndDataCenter(_ as String, _ as DataCenter)
    }

    def 'the .gatherFacts() method behaves correctly'(){
        given:
        def case1 = new Instance(id: 1,name: 'i-db43cf1f',dataCenter: dataCenter)
        def case2 = new Instance(id: 2,name: 'i-db43cf1lc',dataCenter: dataCenter)
        def case3 = new Instance(id: 3,dataCenter: dataCenter)
        def case4 = new Instance(id: 4,name: 'i-db43cf1lc',dataCenter: dataCenter)
        when:
        def fact1 = instanceManager.gatherFacts(case1)
        def fact2 = instanceManager.gatherFacts(case2)
        def fact3 = instanceManager.gatherFacts(case3)
        def fact4 = instanceManager.gatherFacts(case4)
        then:
        4 * instanceDataRepository.fetchInstanceById(_ as Long) >>> [ new Instance(status:AVAILABLE, name:'i-db43cf1f' ), new Instance(status: TERMINATED),null, new Instance()]
        providerManager.gatherFactsInvocations == 2
        1 * instanceDataRepository.updateInstance(_ as Instance) >> true
        fact1
        !fact2
        !fact3
        !fact4
    }

    def 'the .reserveSlot() method behaves correctly'() {
        when:
        instanceManager.reserveSlot(11,'A_USER')
        instanceManager.reserveSlot(12,'A_USER_2',dataCenter)
        instanceManager.reserveSlot(13,'A_USER_3')
        //def case3 = instanceManager.reserveSlot(13,'A_USER_3',dataCenter)
        then:
        4 * instanceDataRepository.findAvailableInstance(_,_) >>> [null,new Instance(dataCenter: dataCenter), new Instance(dataCenter: dataCenter),null]
        2 * instanceDataRepository.fetchInstanceById(_) >>>  [new Instance(status: AVAILABLE, name: 'i-db43cf1f'),new Instance(status: AVAILABLE, name: 'i-db4sc3cf1f')]
        3 * instanceDataRepository.updateInstance(_ as Instance) >> true
        providerManager.gatherFactsInvocations == 2
        providerManager.newInstanceInvocations == 2
        2 * instanceDataRepository.newInstance(_) >> 1L


    }

}

@ProviderFor('AWS')
class StubProviderManager implements InstanceProviderManager{

    private static final String[] INSTANCE_IDS = ['i-db43cf1f','i-db43cf1l']

    int gatherFactsInvocations = 0
    int newInstanceInvocations = 0

    @Override
    Instance gatherFacts(Instance instance, String environment) {
        gatherFactsInvocations++
        INSTANCE_IDS.contains(instance?.name) ? instance : null
    }

    @Override
    Instance newInstance(String environment, DataCenter dataCenter, String username, Instance.Capacity instanceCapacity) {
        newInstanceInvocations++
        return new Instance()
    }
}
