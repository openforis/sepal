package org.openforis.sepal.util

class Terminal {

    static void execute(File workingDir, String... commands) {
        def builder = new ProcessBuilder(commands)
                .directory(workingDir)
                .inheritIO()
        try {
            Process process = builder.start()
            def result = process.waitFor()
            if (result != 0) {
                throw new IllegalStateException("Failed to execute '${commands.join(' ')}' in ${workingDir}: " + result)
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt()
            throw new IllegalStateException(e)
        } catch (IOException e) {
            throw new IOException("Failed to execute $commands", e)
        }
    }
}
