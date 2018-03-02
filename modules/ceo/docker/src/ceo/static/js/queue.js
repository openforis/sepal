var Queue = function(worker) {

    var queue = [];
    var delay = 100;
    var running = false;

    var enqueue = function(o, params) {
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
        if (message) {
            running = true;
            worker(message.o, message.resolve, message.reject, message.params);
        } else {
            setTimeout(poll, delay);
        }
    };

    var empty = function() {
    };

    setTimeout(poll, delay);

    return {
        enqueue: enqueue,
        empty: empty
    };

};
