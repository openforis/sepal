package org.openforis.sepal.component.files.query

import org.apache.commons.lang.SystemUtils
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.Terminal
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class GbUsed implements Query<Double> {
    String username
}

class GbUsedHandler implements QueryHandler<Double, GbUsed> {
    private final File homeDir

    GbUsedHandler(File homeDir) {
        this.homeDir = homeDir
    }

    Double execute(GbUsed query) {
        def userDir = new File(homeDir, query.username)
        userDir.mkdirs()
        double bytes
        if (SystemUtils.IS_OS_WINDOWS)
            bytes = userDir.directorySize()
        else {
            def du = Terminal.execute(userDir,
                    '/bin/bash', '-c',
                    'command -v ionice >/dev/null 2>&1 && ionice -c 2 -n 7 nice -n 19 du -sk . || nice -n 19 du -sk .'
            )
            bytes = du.split(/\W/).first() as double
        }
        return bytes / 1000 / 1000
    }
}
