/**
 * @author Mino Togna
 */

require( './velocity-slide' )
require( './velocity-fade' )
require( './enabling' )
require( './string-utils' )
require( './url-param' )
require( './autocomplete' )
require( './sepal-colorpicker/css/bootstrap-colorpicker.css' )
require( './sepal-bootstrap-colorpicker' )


//String utility methods - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
if ( !String.prototype.endsWith ) {
    String.prototype.endsWith = function ( searchString, position ) {
        var subjectString = this.toString()
        if ( typeof position !== 'number' || !isFinite( position ) || Math.floor( position ) !== position || position > subjectString.length ) {
            position = subjectString.length
        }
        position -= searchString.length;
        var lastIndex = subjectString.lastIndexOf( searchString, position )
        return lastIndex !== -1 && lastIndex === position
    }
}