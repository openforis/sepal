package org.openforis.sepal.endpoint

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher

abstract class SepalEndpoint {

    protected CommandDispatcher commandDispatcher

    SepalEndpoint(CommandDispatcher commandDispatcher) {
        this.commandDispatcher = commandDispatcher
    }

    abstract void registerWith(Controller controller);
}
