/**
 * @author Mino Togna
 */

var emailRegEx = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i

var isValidString = function ( value ) {
    return $.isNotEmptyString( value )
}

var isValidEmail = function ( value ) {
    var valid = false
    if ( isValidString( value ) ) {
        valid = emailRegEx.test( value )
    }
    return valid
}

var isValidPassword = function ( value ) {
    // for now validate as string
    return isValidString( value )
}

// ===================
// Utility methods to validate form input fields and shows errors to UI
// ===================
var showError = function ( errorContainer, message ) {
    errorContainer.velocitySlideDown( {
        delay: 0, duration: 500, begin: function () {
            errorContainer.html( message )
        }
    } )
}

var addError = function ( inputField ) {
    inputField.closest( '.form-group' ).addClass( 'error' )
}

var validateString = function ( field, errorMessage, errorMessageContainer ) {
    if ( !isValidString( field.val() ) ) {
        addError( field )
        showError( errorMessageContainer, errorMessage )
        return false
    }
    return true
}

var validateEmail = function ( field, errorMessage, errorMessageContainer ) {
    if ( !isValidEmail( field.val() ) ) {
        addError( field )
        showError( errorMessageContainer, errorMessage )
        return false
    }
    return true
}

var validatePassword = function ( field, errorMessage, errorMessageContainer ) {
    return validateString( field, errorMessage, errorMessageContainer )
}

var resetFormErrors = function ( form, errorMessageContainer ) {
    form.find( '.form-group' ).removeClass( 'error' )
    if ( !errorMessageContainer ) {
        errorMessageContainer = form.find( '.form-notify' )
    }
    if( errorMessageContainer )
        errorMessageContainer.velocitySlideUp( { delay: 0, duration: 0 } )
}

var validateForm = function ( form ) {
    var errorContainer = form.find( '.form-notify' )
    
    resetFormErrors( form, errorContainer )
    
    var inputs    = form.find( 'input[type=text], input[type=hidden], input[type=password], textarea' )
    var validForm = true
    $.each( inputs, function () {
        var input    = $( this )
        // var property = input.attr( 'name' )
        var type     = input.data( 'type' )
        var errorMsg = input.data( 'error-message' )
        if ( type ) {
            type     = $.capitalize( type )
            errorMsg = (errorMsg) ? errorMsg : 'Invalid field'
            
            var functx = eval( 'validate' + type )
            if ( functx ) {
                var validInputField = functx.call( null, input, errorMsg, errorContainer )
                validForm           = (validInputField) ? validForm : false
                return validForm
            }
        }
    } )
    
    return validForm
}

module.exports = {
    // isValidString    : isValidString
    // , isValidEmail   : isValidEmail
    // , isValidPassword: isValidPassword
    showError         : showError
    , addError        : addError
    , validateString  : validateString
    , validateEmail   : validateEmail
    , validatePassword: validatePassword
    , resetFormErrors : resetFormErrors
    , validateForm    : validateForm
}