package org.openforis.sepal.util

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory


class YamlUtils {

    private YamlUtils(){}

    public static Map<String,Object> parseYaml (String filePath) { parseYaml( new File(filePath) ) }

    public static Map<String,Object> parseYaml ( File file){ parseYaml(new FileInputStream(file)) }


    public static Map<String,Object> parseYaml(InputStream is){
        def ret = null
        ret = is.withCloseable {
            def objMapper = new ObjectMapper( new YAMLFactory() )
            TypeReference<HashMap<String,Object>> typeRef = new TypeReference<HashMap<String,Object>>() {};
            objMapper.readValue(is,typeRef)
        }
        return ret
    }

}
