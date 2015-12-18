package org.openforis.sepal.instance

interface InstanceProviderManager {

    Instance gatherFacts(Instance instance, String environment)

    Instance newInstance(DataCenter dataCenter, String username, InstanceType instanceType)

    Boolean applyMetadata(Instance instance, Map<String,String> metadata)



}