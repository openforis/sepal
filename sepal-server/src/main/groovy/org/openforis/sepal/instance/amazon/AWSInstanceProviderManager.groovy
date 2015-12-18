package org.openforis.sepal.instance.amazon

import org.openforis.sepal.instance.*
import org.openforis.sepal.instance.Instance.Status
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.Instance.Status.*

@ProviderFor("AWS")
class AWSInstanceProviderManager implements InstanceProviderManager {

    private final static Logger LOG = LoggerFactory.getLogger(this)


    private final String availabilityZone
    private final AWSClient awsClient

    AWSInstanceProviderManager (AWSClient awsClient, String availabilityZone){
        this.awsClient = awsClient
        this.availabilityZone = availabilityZone
    }

    @Override
    Instance gatherFacts(Instance instance, String environment) {
        awsClient.fetchInstance(instance?.dataCenter,instance?.name,[Environment: environment],'owner')
    }

    @Override
    Instance newInstance(String environment,DataCenter dataCenter, String username, InstanceType instanceType) {
        def createdInstance = awsClient.newInstance(dataCenter,instanceType,availabilityZone,['Type': 'Sandbox', 'owner': username, 'Environment' : environment, 'Name': "Sandbox($environment)"])
        createdInstance.owner = username
        createdInstance.instanceType = instanceType
        return createdInstance
    }

    @Override
    Boolean applyMetadata(Instance instance, Map<String, String> metadata) {
        return awsClient.applyMetadata(instance.dataCenter,instance.name,metadata)
    }

    public static enum AwsInstanceState {
        PENDING(0,REQUESTED),RUNNING(16,AVAILABLE),SHUTTING_DOWN(32,TERMINATED),ENDED(48,TERMINATED),STOPPING(64,STOPPED),STOP(80,STOPPED)

        private int code
        private Status instanceStatus

        AwsInstanceState(int code, Status instanceStatus){
            this.code = code
            this.instanceStatus = instanceStatus
        }

        static AwsInstanceState fromCode (int code){
            def ret = null
            values().each {
                if (it.code == code){
                    ret = it
                }
            }
            return ret
        }

        Status getStatus(){ this.instanceStatus}
    }
}