package org.openforis.sepal.instance

import org.openforis.sepal.session.InvalidInstance
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.YamlUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.Instance.Status.*

interface InstanceManager {

    void bootstrap(String configFilePath)

    Instance gatherFacts(Instance instance)

    List<InstanceType> getAvailableInstanceTypes(DataCenter dataCenter)

    List<InstanceType> getAvailableInstanceTypes()

    Instance reserveInstance(String username, Long containerInstanceType)

    Instance reserveInstance(String username, Long containerInstanceType, DataCenter dataCenter)

    void releaseInstance(Long instanceId)

}

class ConcreteInstanceManager implements InstanceManager {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final Collection<InstanceProviderManager> providersManager = []
    private final InstanceDataRepository dataRepository
    private final DataCenter defaultDataCenter
    private final String environment

    ConcreteInstanceManager(InstanceDataRepository dataRepository, DataCenter defaultDataCenter, String environment, InstanceProviderManager... providers) {
        providersManager.addAll(providers)
        this.dataRepository = dataRepository
        this.defaultDataCenter = defaultDataCenter
        this.environment = environment
    }

    @Override
    List<InstanceType> getAvailableInstanceTypes() { getAvailableInstanceTypes(defaultDataCenter) }

    @Override
    List<InstanceType> getAvailableInstanceTypes(DataCenter dataCenter) {
        dataRepository.findAvailableInstanceTypes(dataCenter.provider.id)
    }

    private Instance fetchById(long instanceId) { dataRepository.fetchInstanceById(instanceId) }

    @Override
    Instance gatherFacts(Instance instance) {
        def facts
        def instanceData = fetchById(instance?.id)
        def instanceProviderManager = fetchProviderManager(instanceData)
        facts = instanceProviderManager.gatherFacts(instanceData, environment)
        if (facts) {
            facts.id = instanceData.id
            facts.instanceType = dataRepository.fetchInstanceTypeByProviderAndName(instanceData?.dataCenter?.provider, facts.instanceTypeRaw)
            dataRepository.updateInstance(facts)
            switch (facts.status) {
                case NA:
                case STOPPED:
                case TERMINATED:
                    throw new InvalidInstance("Instance($facts) found in a incosistent state: $facts.status")
                    break
                default:
                    LOG.debug("Instance($facts) in status $facts.status")
                    break
            }
        }
        return facts
    }

    @Override
    Instance reserveInstance(String username, Long containerInstanceType) {
        reserveInstance(username, containerInstanceType, defaultDataCenter)
    }

    Instance reserveInstance(String username, Long containerInstanceType, DataCenter dataCenter) {
        Instance instance = dataRepository.findAvailableInstance(dataCenter, containerInstanceType)
        if (instance) {
            def providerManager = fetchProviderManager(instance)
            instance.owner = username
            def instanceFacts = providerManager.gatherFacts(instance, environment)
            if (!instanceFacts.owner) {
                dataRepository.updateInstance(instance)
                providerManager.applyMetadata(instance, [owner: username])
            } else {
                LOG.warn("Instance owner not synchronized")
                instance.owner = instanceFacts.owner
                dataRepository.updateInstance(instance)
                instance = reserveInstance(username, containerInstanceType, dataCenter)
            }
        } else {
            LOG.info("Going to create a new instance")
            def providerManager = fetchProviderManager(dataCenter.provider)
            instance = providerManager.newInstance(environment, dataCenter, username, dataRepository.fetchInstanceTypeById(containerInstanceType))
            instance.id = dataRepository.newInstance(instance)
        }
        return instance
    }


    @Override
    void releaseInstance(Long instanceId) {
        Instance instance = dataRepository.fetchInstanceById(instanceId)
        fetchProviderManager(instance).applyMetadata(instance, [owner: ''])
        instance.owner = null
        dataRepository.updateInstance(instance)
    }

    @Override
    void bootstrap(String configFilePath) {
        LOG.info("Going to initialize instanceManager with file $configFilePath")
        try {
            Is.existingFile(configFilePath)
            def providerMap = YamlUtils.parseYaml(configFilePath)
            providerMap?.providers?.each { provider ->
                try {
                    bootstrapProvider(provider)
                } catch (Exception ex) {
                    LOG.error("Provider($provider) initialization failed", ex)
                }
            }
        } catch (Exception ex) {
            LOG.error("error while bootstrapping InstanceManager", ex)
        }
    }

    private void bootstrapProvider(provider) {
        if (provider) {
            try {
                def provName = provider?.name ?: 'N/A'
                LOG.debug("Bootstrapping $provName")
                def providerManager = fetchProviderManager(provName)
                provider?.instances?.each { instance ->
                    bootstrapInstance(providerManager, instance)
                }
            } catch (Exception ex) {
                LOG.error("Error while bootstrapping provider $provider", ex)
            }
        }
    }

    // @ TODO Implement eventually creation of the instance through the provider and update test cases
    private void bootstrapInstance(InstanceProviderManager providerManager, instance) {
        if (instance?.id) {
            def dcName = instance?.region
            def dataCenter = dataRepository.getDataCenterByName(dcName)
            if (!dataCenter) {
                throw new IllegalArgumentException("Invalid dataCenter: $dcName")
            }
            def instanceMimic = new Instance(name: instance.id, dataCenter: dataCenter)
            def fetchedInstance = providerManager.gatherFacts(instanceMimic, environment)
            if (fetchedInstance) {
                LOG.info("Instance $instance.id detected")
                def storedInstanceData = dataRepository.fetchInstanceByNameAndDataCenter(fetchedInstance.name, fetchedInstance.dataCenter)
                if (!storedInstanceData) {
                    LOG.info("Going to store instance data on the database")
                    fetchedInstance.id = dataRepository.newInstance(fetchedInstance)
                    LOG.debug("Instance stored. Id $fetchedInstance.id")
                }
            } else {
                throw new IllegalArgumentException("Instance $instance.id not available based on the provider data")
            }
        }
    }

    private InstanceProviderManager fetchProviderManager(Instance instance) {
        fetchProviderManager(instance?.dataCenter?.provider)
    }

    private InstanceProviderManager fetchProviderManager(InstanceProvider provider) {
        fetchProviderManager(provider?.name)
    }

    private InstanceProviderManager fetchProviderManager(String providerName) {
        InstanceProviderManager manager = null
        providersManager.each {
            def hasAnnotation = it.class.isAnnotationPresent(ProviderFor.class)
            if (hasAnnotation) {
                Class managerClass = it.class
                ProviderFor providerManager = managerClass.getAnnotation(ProviderFor.class)
                if (providerManager.value() == providerName) {
                    LOG.debug("Identified $managerClass providerManager for $providerName")
                    manager = it
                }
            }
        }
        if (!manager) { throw new IllegalArgumentException("No provider manager found for $providerName") }
        return manager
    }


}