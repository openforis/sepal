package org.openforis.sepal.instance

import groovy.transform.ToString


@ToString
class Instance {

    long id
    Status status
    String publicIp
    String privateIp
    String owner
    String name
    Date launchTime
    Date terminationTime
    Date statusUpdateTime
    Long durationInSecs
    Double costs
    DataCenter dataCenter
    InstanceType instanceType
    String instanceTypeRaw

    public void setMetadata(String name, Object value){
        if (this.hasProperty(name)){
            def propertyType = this.class.getDeclaredField(name)?.type
            if (propertyType == Boolean.class){
                value = Boolean.valueOf(value?.toString())
            }
            this.setProperty(name,value)
        }
    }

    public static enum Status{
        NA,REQUESTED,AVAILABLE,STOPPED,TERMINATED

        public String toString(){ this.name() }

    }

}




