/**
 * @author Mino Togna
 */

var FormValidator = require( './form-validator' )

var populateForm = function ( form, object ) {
    if ( form ) {
        
        var inputs = form.find( 'input[type=text], input[type=hidden], input[type=number], textarea' )
        
        $.each( inputs, function () {
            var input    = $( this )
            var property = input.attr( 'name' )
            var value    = (object) ? object[ property ] : ''
            if ( value ) {
                input.val( value )
            }
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
