package org.openforis.sepal.geoserver

import org.slf4j.Logger
import org.slf4j.LoggerFactory

class NativeProcessingChain implements ProcessingChain {

    private static final Logger LOG = LoggerFactory.getLogger(NativeProcessingChain.class)

    private final File command


    NativeProcessingChain(File command) {
        LOG.debug("NativeProcessingChain instance created. Script file $command.absolutePath")
        this.command = command
    }

    File process(File image, File targetDir) {
        LOG.debug("Going to process the script $command.absolutePath with the following parameters: $image.absolutePath $targetDir.absolutePath")
        def builder = new ProcessBuilder(command.absolutePath, image.absolutePath, targetDir.absolutePath)
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.INHERIT)
        Process process = builder.start()
        try {
            def result = process.waitFor()
            if (result != 0) {
                throw new IllegalStateException("Failed to execute - " + result)
            }
            LOG.debug("Processing correctly executed")
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt()
            throw new IllegalStateException(e)
        }
    }
}
