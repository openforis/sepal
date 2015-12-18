package org.openforis.sepal.instance.local

import org.openforis.sepal.instance.*
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.Instance.Status.AVAILABLE

@ProviderFor('Localhost')
class LocalInstanceProviderManager implements InstanceProviderManager{

    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String LOCAL_INSTANCE_NAME = 'LocalInstance'
    private static final Date LAUNCH_TIME = new Date()

    private final String ipAddress
    private final DataCenter localDataCenter

    LocalInstanceProviderManager (String ipAddress, DataCenter localDataCenter){
        this.ipAddress = ipAddress
        this.localDataCenter = localDataCenter
    }



    @Override
    Instance gatherFacts(Instance instance, String environment) {
        instance.instanceTypeRaw = 'default'
        instance.privateIp = ipAddress
        instance.publicIp = ipAddress
        instance.status = AVAILABLE
        instance.name = LOCAL_INSTANCE_NAME
        instance.dataCenter = localDataCenter
        instance.launchTime = LAUNCH_TIME

        return instance
    }

    @Override
    Instance newInstance(DataCenter dataCenter, String username, InstanceType instType) {
        gatherFacts(new Instance(owner: username, instanceType: instType),'Local')
    }

    @Override
    Boolean applyMetadata(Instance instance, Map<String, String> metadata) {
        metadata.keySet().each {
            instance.setMetadata(it,metadata.get(it))
        }
        return true
    }
}
