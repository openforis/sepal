package org.openforis.sepal.instance

import org.openforis.sepal.instance.Instance.Capacity

interface InstanceProviderManager {

    Instance gatherFacts(Instance instance, String environment)

    Instance newInstance(String environment, DataCenter dataCenter, String username, Capacity instanceCapacity)

}