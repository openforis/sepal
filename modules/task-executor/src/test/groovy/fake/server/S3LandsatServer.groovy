package fake.server

import groovy.xml.MarkupBuilder
import groovymvc.Controller

class S3LandsatServer extends TestServer {
    private static String failFile

    void register(Controller controller) {
        controller.with {
            get('/{sensor}/{path}/{row}/{sceneId}/index.html') {
                def sceneId = params.required('sceneId', String)
                def writer = new StringWriter()
                def builder = new MarkupBuilder(writer)
                builder.html {
                    head {
                        title(sceneId)
                    }
                    body {
                        h1(sceneId)
                        a(href: "${sceneId}_thumb_large.jpg") {
                            img(src: "${sceneId}_thumb_small.jpg")
                        }
                        h2('Files')
                        ul {
                            fileSuffixes.each {
                                file(sceneId, it.key, it.value, builder)
                            }
                        }
                    }
                }
                response.contentType = 'text/html'
                send writer.toString()
            }

            get('/L8/{path}/{row}/{sceneId}/{file}') {
                def file = params.required('file', String)
                if (file == failFile)
                    return halt(500)
                def sceneId = params.required('sceneId', String)
                def fileSuffix = file.substring(sceneId.length())
                if (!fileSuffixes.containsKey(fileSuffix))
                    return halt(404)
                response.contentType = 'application/octet-stream'
                response.outputStream.write(file.bytes)
            }
        }
    }

    private void file(String sceneId, String suffix, String size, builder) {
        builder.li {
            a(href: "${sceneId}${suffix}", "${sceneId}${suffix}")
            mkp.yield(" ($size)")
        }
    }

    void fail(String file) {
        failFile = file
    }


    private final fileSuffixes = [
            '_B3.TIF.ovr' : '6.8MB',
            '_BQA.TIF'    : '2.6MB',
            '_B1.TIF.ovr' : '5.7MB',
            '_BQA.TIF.ovr': '0.5MB',
            '_B5.TIF.ovr' : '7.2MB',
            '_B1.TIF'     : '52.2MB',
            '_B11_wrk.IMD': '10.3KB',
            '_B7.TIF.ovr' : '6.8MB',
            '_B6_wrk.IMD' : '10.3KB',
            '_B5_wrk.IMD' : '10.3KB',
            '_B11.TIF.ovr': '6.4MB',
            '_B9_wrk.IMD' : '10.3KB',
            '_B4_wrk.IMD' : '10.3KB',
            '_B4.TIF'     : '54.0MB',
            '_B4.TIF.ovr' : '7.0MB',
            '_MTL.txt'    : '7.7KB',
            '_B7_wrk.IMD' : '10.3KB',
            '_B2.TIF'     : '51.7MB',
            '_B3_wrk.IMD' : '10.3KB',
            '_B10.TIF.ovr': '6.6MB',
            '_B5.TIF'     : '56.1MB',
            '_B6.TIF'     : '54.7MB',
            '_B8.TIF'     : '214.7MB',
            '_B10.TIF'    : '42.6MB',
            '_B3.TIF'     : '52.5MB',
            '_B1_wrk.IMD' : '10.3KB',
            '_B2_wrk.IMD' : '10.3KB',
            '_B10_wrk.IMD': '10.3KB',
            '_BQA_wrk.IMD': '10.3KB',
            '_B9.TIF.ovr' : '3.6MB',
            '_B8_wrk.IMD' : '10.3KB',
            '_B7.TIF'     : '53.3MB',
            '_B6.TIF.ovr' : '7.0MB',
            '_B9.TIF'     : '37.4MB',
            '_B2.TIF.ovr' : '6.7MB',
            '_B11.TIF'    : '41.2MB',
            '_B8.TIF.ovr' : '27.1MB'
    ]
//    http://landsat-pds.s3.amazonaws.com/L8/191/031/LC81910312015182LGN00/index.html
//    http://landsat-pds.s3.amazonaws.com/L8/001/003/LC80010032014272LGN00/index.html
    public static void main(String[] args) {
        new S3LandsatServer().start()
    }

}
