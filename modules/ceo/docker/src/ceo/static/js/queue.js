var Queue = function(worker) {

    var queue = [];
    var delay = 100;
    var running = false;
    var emptyListeners = [];
    var empty = true;

    var enqueue = function(o, params) {
        setEmpty(false);
        var promise = new Promise(function(resolve, reject) {
            queue.push({
                o: o,
                resolve: resolve,
                reject: reject,
                params: params
            });
        });
        promise.then(poll, poll);
        return promise;
    };

    var poll = function() {
        running = false;
        var message = queue.shift();
        setEmpty(queue.length === 0);
        if (message) {
            running = true;
            worker(message.o, message.resolve, message.reject, message.params);
        } else {
            setTimeout(poll, delay);
        }
    };

    var isEmpty = function() {
        return empty;
    };

    var setEmpty = function(_empty) {
        if (_empty != empty) {
            emptyListeners.forEach(function (listener) { 
                listener(_empty);
            })
        }
        empty = _empty;
    }

    var addEmptyListener = function(listener) {
        emptyListeners.push(listener);
    };

    setTimeout(poll, delay);

    return {
        enqueue: enqueue,
        empty: isEmpty,
        addEmptyListener: addEmptyListener
    };

};
