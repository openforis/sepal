/**
 * @author Mino Togna
 */

var FormValidator = require( './form-validator' )

var populateForm = function ( form, object ) {
    if ( form ) {
        
        var inputs = form.find( 'input, textarea' )
        
        $.each( inputs, function () {
            var input    = $( this )
            var property = input.attr( 'name' )
            var value    = (object && object[ property ]) ? object[ property ] : ''
            input.val( value )
        } )
        
    }
}

var resetForm = function ( form ) {
    form.trigger( 'reset' )
    FormValidator.resetFormErrors( form )
}

module.exports = {
    populateForm: populateForm
    , resetForm : resetForm
}
