/**
 * @author Mino Togna
 */

var emailRegEx    = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i
var passwordRegEx = /^.{6,100}$/

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
    var valid = false
    if ( isValidString( value ) ) {
        valid = passwordRegEx.test( value )
    }
    return valid
}

// ===================
// Utility methods to validate form input fields and shows errors to UI
// ===================
var showError = function ( errorContainer, message ) {
    showMessage( errorContainer, message, 'error' )
    // errorContainer.removeClass( 'form-success' ).addClass( 'form-error' )
    // errorContainer.velocitySlideDown( {
    //     delay: 0, duration: 500, begin: function () {
    //         errorContainer.html( message )
    //     }
    // } )
}

var showSuccess = function ( container, message ) {
    showMessage( container, message, 'success' )
    var form      = $( container.parentsUntil( 'form' ) )
    var btnSubmit = $( form.find( 'button[type=submit]' ) )
    btnSubmit.disable()
    resetFormErrors( form, container, { delay: 1500, duration: 500 } )
    setTimeout( function () {
        btnSubmit.enable()
    }, 2000 )
}

var showMessage = function ( container, message, type ) {
    container.removeClass( 'form-success form-error' ).addClass( 'form-' + type )
    container.velocitySlideDown( {
        delay: 0, duration: 500, begin: function () {
            container.html( message )
        }
    } )
}

var addError = function ( inputField ) {
    if ( inputField )
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
    if ( !isValidPassword( field.val() ) ) {
        addError( field )
        showError( errorMessageContainer, errorMessage )
        return false
    }
    return true
}

var resetFormErrors = function ( form, errorMessageContainer, slideOptions ) {
    form.find( '.form-group' ).removeClass( 'error' )
    if ( !errorMessageContainer ) {
        errorMessageContainer = form.find( '.form-notify' )
    }
    if ( errorMessageContainer ) {
        var opts = $.extend( {}, { delay: 0, duration: 0 }, slideOptions )
        errorMessageContainer.velocitySlideUp( opts )
    }
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
    , showSuccess     : showSuccess
    , addError        : addError
    , validateString  : validateString
    , validateEmail   : validateEmail
    , validatePassword: validatePassword
    , resetFormErrors : resetFormErrors
    , validateForm    : validateForm
}