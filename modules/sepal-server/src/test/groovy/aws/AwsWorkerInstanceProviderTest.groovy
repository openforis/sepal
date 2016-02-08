package aws

import org.openforis.sepal.hostingservice.aws.AwsWorkerInstanceProvider
import org.openforis.sepal.hostingservice.aws.Config

class AwsWorkerInstanceProviderTest {
    public static void main(String[] args) {
        def home = "${System.getProperty('user.home')}"
        new AwsWorkerInstanceProvider(new Config("$home/.sepal/test-aws.properties"))
    }
}
