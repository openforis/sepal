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
    Boolean disposable
    Boolean reserved
    DataCenter dataCenter
    Capacity capacity

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
        NA,REQUESTED,CREATED,AVAILABLE,STOPPED,TERMINATED

        public String toString(){ this.name() }

    }

    public static enum Capacity {
        TINY(1),SMALL(2),MEDIUM(4),BIG(16),LARGE(32),XLARGE(64)

        long value

        Capacity(long value){
            this.value = value
        }

        static Capacity fromValue( long value){
            def capacity = null
            if (value) {
                values().each {
                    capacity = it.value == value ? it : null
                }
            }
            return capacity
        }
    }


}




