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

var validateString = function ( field, errorMessage, errorMessageContainer ) {
    if ( !isValidString( field.val() ) ) {
        field.closest( '.form-group' ).addClass( 'error' )
        showError( errorMessageContainer, errorMessage )
        return false
    }
    return true
}

var validateEmail = function ( field, errorMessage, errorMessageContainer ) {
    if ( !isValidEmail( field.val() ) ) {
        field.closest( '.form-group' ).addClass( 'error' )
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
    errorMessageContainer.velocitySlideUp( { delay: 0, duration: 100 } )
}

module.exports = {
    // isValidString    : isValidString
    // , isValidEmail   : isValidEmail
    // , isValidPassword: isValidPassword
    showError         : showError
    , validateString  : validateString
    , validateEmail   : validateEmail
    , validatePassword: validatePassword
    , resetFormErrors : resetFormErrors
}