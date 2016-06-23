package fake.server

import groovymvc.Controller

class GoogleLandsatServer extends TestServer {
    private static String failScene

    void register(Controller controller) {
        controller.with {
            get('/earthengine-public/landsat/{sensor}/{path}/{row}/{sceneId}.tar.bz') {
                def sceneId = params.required('sceneId', String)
                if (sceneId == failScene)
                    return halt(500)
                def bytes = getClass().getResourceAsStream('/gs/scene.tar.bz2').bytes
                response.contentType = 'application/octet-stream'
                response.outputStream.write(bytes)
            }
        }
    }

    private void file(String sceneId, String suffix, String size, builder) {
        builder.li {
            a(href: "${sceneId}${suffix}", "${sceneId}${suffix}")
            mkp.yield(" ($size)")
        }
    }

    void fail(String sceneId) {
        failScene = sceneId
    }

//    http://storage.googleapis.com/earthengine-public/landsat/L5/174/060/LT51740601987034AAA01.tar.bz
    public static void main(String[] args) {
        new GoogleLandsatServer().start()
    }
}
