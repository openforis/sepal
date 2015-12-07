package org.openforis.sepal.instance.amazon

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.regions.Regions
import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.services.ec2.model.*
import org.openforis.sepal.instance.DataCenter
import org.openforis.sepal.instance.Instance
import org.openforis.sepal.instance.InstanceType
import org.openforis.sepal.session.InvalidInstance
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.instance.amazon.AWSInstanceProviderManager.AwsInstanceState.fromCode

interface AWSClient {


    Instance fetchInstance ( DataCenter dataCenter, String instanceName, Map<String,String> filters, String... metadataToFetch )

    Instance newInstance (DataCenter dataCenter, InstanceType instanceType, Map<String,String> tags)

    Boolean applyMetadata (DataCenter dataCenter, String instanceName, Map<String,String> tags)
}

class RestAWSClient implements AWSClient{

    private static final Logger LOG = LoggerFactory.getLogger(this)


    private Map<String,AmazonEC2Client> regionClients = [:]
    private final BasicAWSCredentials credentials
    private final String securityGroup
    private final String amiName

    RestAWSClient(String accessKey, String secretKey, String securityGroup, String amiName){
        credentials = new BasicAWSCredentials(accessKey,secretKey)
        this.securityGroup = securityGroup
        this.amiName = amiName
    }

    private AmazonEC2Client getClient(Region region){
        def client
        if (regionClients.containsKey(region?.name)){
            client = regionClients.get(region?.name)
        }else{
            client = new AmazonEC2Client(credentials)
            client.setRegion(region)
            regionClients.put(region?.name,client)
        }
        return client
    }

   private static Region getDataCenterRegion(DataCenter dataCenter){
        return Region.getRegion(Regions.fromName(dataCenter?.name))
    }

    @Override
    Instance newInstance(DataCenter dataCenter, InstanceType instanceType, Map<String, String> tags) {
        def instance = null
        def client = getClient(getDataCenterRegion(dataCenter))
        RunInstancesRequest request = new RunInstancesRequest()
        request.withKeyName(fetchKeyPairName(dataCenter))
        request.withMaxCount(1)
        request.withMinCount(1)
        request.withInstanceType(instanceType.name)
        request.withSecurityGroups(securityGroup)
        request.withImageId(amiName)

        RunInstancesResult result = client.runInstances(request)
        result?.reservation?.each { reservation ->
            reservation?.instances?.each { awsInstance ->
                    instance = mapInstance(awsInstance)
                    instance.dataCenter = dataCenter
            }
        }
        return instance
    }

    @Override
    Instance fetchInstance(DataCenter dataCenter, String instanceName, Map<String, String> tags, String... metadataToFetch) {
        def instance = null
        def client = getClient(getDataCenterRegion(dataCenter))
        DescribeInstancesRequest request = new DescribeInstancesRequest()
        if (instanceName){
            request.setInstanceIds([instanceName])
        }
        def filters = []
        tags?.keySet()?.each {
            filters.add(new Filter("tag:$it",[tags.get(it)]))
        }
        if (filters){
            request.withFilters(filters)
        }
        DescribeInstancesResult result = client.describeInstances(request)
        result?.reservations?.each { reservation ->
            reservation?.instances?.each { awsInstance ->
                if (awsInstance.instanceId == instanceName){
                    instance = mapInstance(awsInstance,metadataToFetch)
                    instance.dataCenter = dataCenter
                }
            }
        }

        return instance
    }

    @Override
    Boolean applyMetadata(DataCenter dataCenter, String instanceName, Map<String, String> tags) {
        def instance = fetchInstance(dataCenter,instanceName,null)
        if (instance){
            def client = getClient(getDataCenterRegion(dataCenter))
            CreateTagsRequest request = new CreateTagsRequest()
            def tagsToApply = []
            request.withResources(instanceName)
            tags?.keySet()?.each {
                tagsToApply.add(new Tag(it,tags.get(it)))
            }
            request.withTags(tagsToApply)

            client.createTags(request)
        }else{
            LOG.warn("Unable to apply metadata to $instanceName. Instance not found")
        }
        return instance
    }

    private String fetchKeyPairName ( DataCenter dataCenter ){
        def client = getClient(getDataCenterRegion(dataCenter))
        def request = new DescribeKeyPairsRequest()
        request.withKeyNames(dataCenter.name)
        def response = client.describeKeyPairs(request)
        if (!response?.keyPairs){
            throw new InvalidInstance("Unable to get keyPair for $dataCenter")
        }
        def keyPair = response.keyPairs.first()
        return keyPair.keyName
    }

    private static Instance mapInstance (com.amazonaws.services.ec2.model.Instance awsInstance, String[] metadataToFetch){
        def instance = new Instance()
        instance.name = awsInstance.instanceId
        instance.privateIp = awsInstance.privateIpAddress
        instance.publicIp = awsInstance.publicIpAddress
        instance.launchTime = awsInstance.launchTime
        instance.instanceTypeRaw = awsInstance.instanceType


        def awsInstanceState = fromCode(awsInstance.state.code)
        instance.status = awsInstanceState.status

        instance.statusUpdateTime = new Date()
        metadataToFetch?.each { metadata ->
            awsInstance.tags.each { tag ->
                if (tag.key == metadata) {
                    instance.setMetadata(tag.key,tag.value)
                }
            }
        }


        return instance
    }


}