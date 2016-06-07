package org.openforis.sepal.component.dataprovider

import org.openforis.sepal.util.annotation.Data

@Data
class DownloadRequest implements Cloneable, Serializable {
    int requestId
    String requestName
    String username
    Date requestTime
    Boolean groupScenes
    String processingChain
    DataSet dataSet
    List<SceneRequest> scenes = []
    Status status

}
