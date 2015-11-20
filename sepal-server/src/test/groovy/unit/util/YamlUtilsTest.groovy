package unit.util

import org.openforis.sepal.util.YamlUtils
import spock.lang.Specification


class YamlUtilsTest extends Specification{

    def 'testing the correct behavior of the method parseYaml'(){
        given:
        def is = YamlUtilsTest.getResourceAsStream('/instances.yml')
        when:
        def result = YamlUtils.parseYaml(is)
        then:
        result
        result.size() == 1
        result.providers
        result.providers.size() == 1
        def provider1 = result.providers.first()
        provider1.name == 'AWS'
        provider1.description == 'AmazonWebServices'
        provider1.instances.size() == 2
        def firstProviderInstance = provider1.instances.first()
        firstProviderInstance
        firstProviderInstance.id == 'i-db43cf1f'
        firstProviderInstance.region == 'us-west-2'
        def secondProviderInstance = provider1.instances.get(1)
        secondProviderInstance
        secondProviderInstance.id == 'i-db43cf1l'
        secondProviderInstance.region == 'us-west-1'

    }
}
