/**
 * @author Mino Togna
 */

//example usage:
// $.debounce(function() {
//   // All the taxing stuff you do
// }, 250);

(function ($) {
  
  $.debounce = function (func, wait, immediate) {
    var timeout
    return function () {
      var context = this, args = arguments
      var later   = function () {
        timeout = null
        if (!immediate) func.apply(context, args)
      }
      var callNow = immediate && !timeout
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
      if (callNow) func.apply(context, args)
    }
  }
  
}(jQuery))