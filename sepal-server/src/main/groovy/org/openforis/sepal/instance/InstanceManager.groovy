package org.openforis.sepal.instance

import org.openforis.sepal.util.Is
import org.openforis.sepal.util.YamlUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.Instance.Status.*

interface InstanceManager {

    Instance reserveSlot ( int slotSize,String username, DataCenter dataCenter)
    Instance reserveSlot ( int slotSize,String username)
    Instance gatherFacts( Instance instance )
    void bootstrap ( String configFilePath )

}

class ConcreteInstanceManager implements InstanceManager{

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final Collection<InstanceProviderManager> providersManager = []
    private final InstanceDataRepository dataRepository
    private final DataCenter defaultDataCenter
    private final String environment

    ConcreteInstanceManager(InstanceDataRepository dataRepository,DataCenter defaultDataCenter,String environment,InstanceProviderManager... providers){
        providersManager.addAll(providers)
        this.dataRepository = dataRepository
        this.defaultDataCenter = defaultDataCenter
        this.environment = environment
    }


    private Instance fetchById(long instanceId) { dataRepository.fetchInstanceById(instanceId) }


    @Override
    Instance gatherFacts(Instance instance) {
        def facts = null
        Instance inst = fetchById(instance?.id)
        LOG.debug("Instance($instance) info found over the repository(db)")
        if (inst && !(inst.status == TERMINATED)){
            def checkedInstance = fetchProviderManager(instance)?.gatherFacts(inst,environment)
            if (checkedInstance){
                switch(checkedInstance.status){
                    case NA:
                    case STOPPED:
                    case TERMINATED:
                        LOG.debug("Instance($checkedInstance) found in a incosistent state: $checkedInstance.status")
                        break
                    default:
                        LOG.debug("Instance($checkedInstance) in status $checkedInstance.status")
                        facts = checkedInstance
                        break
                }
            }else{
                LOG.warn("The instance($inst) is not available anymore")
                inst.status = TERMINATED
                inst.terminationTime = new Date()
                dataRepository.updateInstance(inst)
            }
        }
        return facts
    }

    @Override
    synchronized Instance reserveSlot(int slotSize, String username ,DataCenter dataCenter = defaultDataCenter) {
        def instance
        instance = dataRepository.findAvailableInstance(slotSize,dataCenter)
        if (instance){
            LOG.debug("Found a potential available instance to host sandbox container($slotSize) for $username ")
            def instanceFetched = gatherFacts(instance)
            if (instanceFetched){
                LOG.debug('Instance correctly validated by the providerManager')
                instanceFetched.owner = instance.reserved  ? username : null
                dataRepository.updateInstance(instanceFetched)
                instance = instanceFetched
            }else{
                LOG.warn("Found stale data about a running instance.")
                instance.status = TERMINATED
                dataRepository.updateInstance(instance)
                instance = reserveSlot(slotSize,username,dataCenter)
            }
        }else{
            LOG.info("Going to create a new instance to host container($slotSize) for $username")
            instance = fetchProviderManager(dataCenter.provider)?.newInstance(environment,dataCenter,username,Instance.Capacity.fromValue(slotSize))
            instance.id = dataRepository.newInstance(instance)
            LOG.info("Instance correctly created. Id $instance.id")
        }
        return instance

    }

    @Override
    void bootstrap(String configFilePath) {
        LOG.info("Going to initialize instanceManager with file $configFilePath")
        try{
            Is.existingFile(configFilePath)
            def providerMap = YamlUtils.parseYaml(configFilePath)
            providerMap?.providers?.each { provider ->
                try{
                    bootstrapProvider(provider)
                }catch (Exception ex){
                    LOG.error("Provider($provider) initialization failed",ex)
                }
            }
        }catch (Exception ex){
            LOG.error("error while bootstrapping InstanceManager",ex)
        }
    }

    private void bootstrapProvider (provider) {
        if (provider){
            try{
                def provName = provider?.name?: 'N/A'
                LOG.debug("Bootstrapping $provName")
                def providerManager = fetchProviderManager(provName)
                provider?.instances?.each{ instance ->
                    bootstrapInstance(providerManager,instance)
                }
            }catch (Exception ex){
                LOG.error("Error while bootstrapping provider $provider",ex)
            }

        }
    }


    // @ TODO Implement eventually creation of the instance through the provider and update test cases
    private void bootstrapInstance (InstanceProviderManager providerManager, instance) {
        if (instance?.id){
            def instanceMimic = new Instance(name: instance.id, dataCenter: new DataCenter(name: instance?.region))
            def fetchedInstance = providerManager.gatherFacts(instanceMimic,environment)
            if (fetchedInstance){
                LOG.info("Instance $instance.id detected")
                def storedInstanceData = dataRepository.fetchInstanceByNameAndDataCenter(fetchedInstance.name,fetchedInstance.dataCenter)
                if (!storedInstanceData){
                    LOG.info("Going to store instance data on the database")
                    fetchedInstance. id = dataRepository.newInstance(fetchedInstance)
                    LOG.debug("Instance stored. Id $fetchedInstance.id")
                }
            }else{
                throw new IllegalArgumentException("Instance $instance.id not available based on the provider data")
            }
        }
    }

    private InstanceProviderManager fetchProviderManager ( Instance instance) { fetchProviderManager(instance?.dataCenter?.provider)}

    private InstanceProviderManager fetchProviderManager (InstanceProvider provider) { fetchProviderManager(provider?.name) }

    private InstanceProviderManager fetchProviderManager ( String providerName ){
        InstanceProviderManager manager = null
        providersManager.each {
            def hasAnnotation = it.class.isAnnotationPresent(ProviderFor.class)
            if (hasAnnotation){
                Class managerClass = it.class
                ProviderFor providerManager = managerClass.getAnnotation(ProviderFor.class)
                if (providerManager.value() == providerName){
                    LOG.debug("Identified $managerClass providerManager for providerName")
                    manager = it
                }
            }
        }
        if (!manager) { throw new IllegalArgumentException("No provider manager found for $providerName") }
        return manager
    }


}