package org.openforis.sepal.instance.amazon

import org.openforis.sepal.instance.DataCenter
import org.openforis.sepal.instance.Instance
import org.openforis.sepal.instance.Instance.Status
import org.openforis.sepal.instance.InstanceProviderManager
import org.openforis.sepal.instance.ProviderFor
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.Instance.Status.*

@ProviderFor("AWS")
class AWSInstanceProviderManager implements InstanceProviderManager {

    private final static Logger LOG = LoggerFactory.getLogger(this)


    private final AWSClient awsClient

    AWSInstanceProviderManager (AWSClient awsClient){
        this.awsClient = awsClient
    }

    @Override
    Instance gatherFacts(Instance instance, String environment) {
        awsClient.fetchInstance(instance?.dataCenter,instance?.name,[Environment: environment],'owner','reserved','disposable')
    }

    @Override
    Instance newInstance(String environment, DataCenter dataCenter, String username, Instance.Capacity instanceCapacity) {
        awsClient.newInstance(
                dataCenter,AwsInstanceType.fromCapacity(instanceCapacity.value),[environment: environment, user: username]
        )
    }

    public static enum AwsInstanceType{

        T2_MICRO(1,'t2.micro'), T2_SMALL(2,'t2.small'),T2_MEDIUM(4,'t2.medium'),
        T2_LARGE(8,'t2.large'),M4_XLARGE(16,'m4.xlarge'), M4_XXL(32,'m4.2xlarge')

        long capacity
        String value

        AwsInstanceType ( long capacity, String value){
            this.capacity = capacity
            this.value = value
        }

        static AwsInstanceType fromCapacity(long capacity){
            def type = null
            values().each {
                if (it.capacity == capacity){
                    type = it
                }
            }
            return type
        }

        static AwsInstanceType fromName ( String name) {
            def type = null
            values().each {
                if (it.value == name){
                    type = it
                }
            }
            return type
        }
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