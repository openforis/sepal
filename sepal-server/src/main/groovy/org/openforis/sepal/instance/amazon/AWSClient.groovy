package org.openforis.sepal.instance.amazon

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.regions.Regions
import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.services.ec2.model.DescribeInstancesRequest
import com.amazonaws.services.ec2.model.DescribeInstancesResult
import com.amazonaws.services.ec2.model.Filter
import org.openforis.sepal.instance.DataCenter
import org.openforis.sepal.instance.Instance

import static org.openforis.sepal.instance.Instance.Capacity.XLARGE
import static org.openforis.sepal.instance.amazon.AWSInstanceProviderManager.AwsInstanceState.fromCode
import static org.openforis.sepal.instance.amazon.AWSInstanceProviderManager.AwsInstanceType
import static org.openforis.sepal.instance.amazon.AWSInstanceProviderManager.AwsInstanceType.fromName

interface AWSClient {


    Instance fetchInstance ( DataCenter dataCenter, String instanceName, Map<String,String> filters, String... metadataToFetch )

    Instance newInstance ( DataCenter dataCenter, AwsInstanceType instanceType ,Map<String,String> tags)
}

class RestAWSClient implements AWSClient{


    private Map<String,AmazonEC2Client> regionClients = [:]
    private final BasicAWSCredentials credentials

    RestAWSClient(String accessKey, String secretKey){
        credentials = new BasicAWSCredentials(accessKey,secretKey)
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
    Instance fetchInstance(DataCenter dataCenter, String instanceName, Map<String, String> tags, String... metadataToFetch) {
        def instance = null
        def client = getClient(getDataCenterRegion(dataCenter))
        DescribeInstancesRequest request = new DescribeInstancesRequest()
        request.setInstanceIds([instanceName])
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

    private static Instance mapInstance (com.amazonaws.services.ec2.model.Instance awsInstance,String[] metadataToFetch){
        def instance = new Instance()
        instance.name = awsInstance.instanceId
        instance.privateIp = awsInstance.privateIpAddress
        instance.publicIp = awsInstance.publicIpAddress
        instance.launchTime = awsInstance.launchTime
        def awsInstanceType = fromName(awsInstance.instanceType)

        // @ TODO Workaround until EFS is available
        instance.capacity = XLARGE
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

    @Override
    Instance newInstance(DataCenter dataCenter, AwsInstanceType instanceType, Map<String, String> tags) {
        throw new AbstractMethodError("Not implemented yey")
    }
}