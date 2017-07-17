/**
 * @author Mino Togna
 */

require('./velocity-slide')
require('./velocity-fade')
require('./enabling')
require('./string-utils')
require('./url-param')
require('./autocomplete')
require('./sepal-colorpicker/css/bootstrap-colorpicker.css')
require('./sepal-bootstrap-colorpicker')

//String utility methods - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function (searchString, position) {
    var subjectString = this.toString()
    if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
      position = subjectString.length
    }
    position -= searchString.length
    var lastIndex = subjectString.lastIndexOf(searchString, position)
    return lastIndex !== -1 && lastIndex === position
  }
}

// https://tc39.github.io/ecma262/#sec-array.prototype.find
if (!Array.prototype.find) {
  Object.defineProperty(Array.prototype, 'find', {
    value: function (predicate) {
      // 1. Let O be ? ToObject(this value).
      if (this == null) {
        throw new TypeError('"this" is null or not defined')
      }
      
      var o = Object(this)
      
      // 2. Let len be ? ToLength(? Get(O, "length")).
      var len = o.length >>> 0
      
      // 3. If IsCallable(predicate) is false, throw a TypeError exception.
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function')
      }
      
      // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
      var thisArg = arguments[1]
      
      // 5. Let k be 0.
      var k = 0
      
      // 6. Repeat, while k < len
      while (k < len) {
        // a. Let Pk be ! ToString(k).
        // b. Let kValue be ? Get(O, Pk).
        // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
        // d. If testResult is true, return kValue.
        var kValue = o[k]
        if (predicate.call(thisArg, kValue, k, o)) {
          return kValue
        }
        // e. Increase k by 1.
        k++
      }
      
      // 7. Return undefined.
      return undefined
    }
  })
}

if (!Array.prototype.filter) {
  Array.prototype.filter = function(fun/*, thisArg*/) {
    'use strict';
    
    if (this === void 0 || this === null) {
      throw new TypeError();
    }
    
    var t = Object(this);
    var len = t.length >>> 0;
    if (typeof fun !== 'function') {
      throw new TypeError();
    }
    
    var res = [];
    var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
    for (var i = 0; i < len; i++) {
      if (i in t) {
        var val = t[i];
        
        // NOTE: Technically this should Object.defineProperty at
        //       the next index, as push can be affected by
        //       properties on Object.prototype and Array.prototype.
        //       But that method's new, and collisions should be
        //       rare, so use the more-compatible alternative.
        if (fun.call(thisArg, val, i, t)) {
          res.push(val);
        }
      }
    }
    
    return res;
  };
}