package org.openforis.sepal.component.task

interface InstanceProvider {
    Instance launchReserved(String username, Instance.Role role, String instanceType)

    Instance launchIdle(String instanceType)

    void instanceProvisioning(Instance idleInstance, String username, Instance.Role role)

    void instanceActive(Instance instance)

    List<Instance> allInstances()

    void release(String instanceId)
}
