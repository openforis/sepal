package org.openforis.sepal.sandbox

import groovy.transform.ToString
import org.openforis.sepal.instance.Instance

@ToString
class SandboxData implements Serializable {
    int sandboxId
    String username
    SandboxStatus status
    String containerId
    String uri
    Date createdOn
    Date terminatedOn
    Date statusRefreshedOn
    Size size
    Instance instance

    SandboxData() {
        super()
    }

}

enum SandboxStatus {
    REQUESTED,ALIVE,TERMINATED
}

enum Size {
    TINY(1),SMALL(2),MEDIUM(4),BIG(16),LARGE(32),XLARGE(64)

    int value

    Size(int size){
        this.value = size
    }

    static Size byValue(int value){
        def instance = null
        values().each {
            if (value == it.value){
                instance = it
            }
        }
        return instance
    }
}
