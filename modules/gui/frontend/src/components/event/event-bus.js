/**
 *
 * The MIT License (MIT)
 Copyright (c) 2014 Krasimir Tsonev , Mino Togna

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

var EventBusClass = {};
EventBusClass = function () {
    this.listeners = {};
    this.groupListeners = {};
};
EventBusClass.prototype = {
    addEventListener: function (type, callback, scope) {
        var args = [];
        var numOfArgs = arguments.length;
        for (var i = 0; i < numOfArgs; i++) {
            args.push(arguments[i]);
        }
        args = args.length > 3 ? args.splice(3, args.length - 1) : [];
        if (typeof this.listeners[type] != "undefined") {
            this.listeners[type].push({scope: scope, callback: callback, args: args});
        } else {
            this.listeners[type] = [{scope: scope, callback: callback, args: args}];
        }

        var group = this.getGroup(type);
        if (group) {
            if (typeof this.groupListeners[group] != "undefined") {
                this.groupListeners[group].push({scope: scope, callback: callback, args: args, type: type});
            } else {
                this.groupListeners[group] = [{scope: scope, callback: callback, args: args, type: type}];
            }
        }
    },
    removeEventListener: function (type, callback, scope) {
        if (typeof this.listeners[type] != "undefined") {
            var numOfCallbacks = this.listeners[type].length;
            var newArray = [];
            for (var i = 0; i < numOfCallbacks; i++) {
                var listener = this.listeners[type][i];
                if (listener.scope == scope && listener.callback == callback) {

                } else {
                    newArray.push(listener);
                }
            }
            this.listeners[type] = newArray;
        }
    },
    removeEventListenersByGroup: function (group) {
        if (typeof this.groupListeners[group] != "undefined") {
            var listeners = this.groupListeners[group];
            for (var i in listeners) {
                var listener = listeners[i];
                this.removeEventListener(listener.type, listener.callback, listener.scope);
            }
            this.groupListeners[group] = undefined;
        }
    },
    hasEventListener: function (type, callback, scope) {
        if (typeof this.listeners[type] != "undefined") {
            var numOfCallbacks = this.listeners[type].length;
            if (callback === undefined && scope === undefined) {
                return numOfCallbacks > 0;
            }
            for (var i = 0; i < numOfCallbacks; i++) {
                var listener = this.listeners[type][i];
                if ((scope ? listener.scope == scope : true) && listener.callback == callback) {
                    return true;
                }
            }
        }
        return false;
    },
    dispatch: function (type, target) {
        var numOfListeners = 0;
        var event = {
            type: type,
            target: target
        };
        var args = [];
        var numOfArgs = arguments.length;
        for (var i = 0; i < numOfArgs; i++) {
            args.push(arguments[i]);
        }
        ;
        args = args.length > 2 ? args.splice(2, args.length - 1) : [];
        args = [event].concat(args);
        if (typeof this.listeners[type] != "undefined") {
            var numOfCallbacks = this.listeners[type].length;
            for (var i = 0; i < numOfCallbacks; i++) {
                var listener = this.listeners[type][i];
                if (listener && listener.callback) {
                    var concatArgs = args.concat(listener.args);
                    listener.callback.apply(listener.scope, concatArgs);
                    numOfListeners += 1;
                }
            }
        }
    },
    getEvents: function () {
        var str = "";
        for (var type in this.listeners) {
            var numOfCallbacks = this.listeners[type].length;
            for (var i = 0; i < numOfCallbacks; i++) {
                var listener = this.listeners[type][i];
                str += listener.scope && listener.scope.className ? listener.scope.className : "anonymous";
                str += " listen for '" + type + "'\n";
            }
        }
        return str;
    },

    getGroup: function (type) {
        var group = '';
        var index = type.lastIndexOf('.');
        if (index > 0) {
            group = type.substring(0, index);
        }
        return group;
    }
    
};

var EventBus = new EventBusClass();

module.exports = EventBus;