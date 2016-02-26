package org.openforis.sepal.util

class Terminal {

    static void execute(File workingDir, String... commands) {
        def builder = new ProcessBuilder(commands)
                .directory(workingDir)
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.INHERIT)
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

    static List<String> executeAndReturn(File workingDir, String... commands) {
        def builder = new ProcessBuilder(commands)
                .directory(workingDir)
        try {
            Process process = builder.start()
            def result = process.waitFor()
            if (result != 0) {
                String error = null
                try {
                    error = process.errorStream.getText('UTF-8')
                } catch (Exception ignore) {}
                throw new IllegalStateException("Failed to execute '${commands.join(' ')}' in $workingDir. Exit code: ${result}. Error: $error")
            }
            return process.inputStream.readLines('UTF-8')
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt()
            throw new IllegalStateException('Execution was interrupted', e)
        } catch (IOException e) {
            throw new IOException("Failed to execute $commands", e)
        }
    }

    static boolean isProgram(String program) {
        def builder = new ProcessBuilder('command', '-v', program)
        try {
            Process process = builder.start()
            def result = process.waitFor()
            return result == 0
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt()
            throw new IllegalStateException('Execution was interrupted', e)
        } catch (IOException e) {
            throw new IOException("Failed to check if $program is a program", e)
        }
    }

}
