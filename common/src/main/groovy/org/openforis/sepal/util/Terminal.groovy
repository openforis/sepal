package org.openforis.sepal.util

class Terminal {

    static String execute(File workingDir, String... commands) {
        def builder = new ProcessBuilder(commands)
                .directory(workingDir)
        try {
            Process process = builder.start()
            def result = process.waitFor()
            if (result != 0) {
                throw new IllegalStateException("Failed to execute '${commands.join(' ')}' in ${workingDir}. " +
                        "exitCode: $result, " +
                        "stderr: '${process.err.getText('UTF-8')}'",
                )
            }
            return process.text
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt()
            throw new IllegalStateException(e)
        } catch (IOException e) {
            throw new RuntimeException("Failed to execute $commands", e)
        }
    }
}
