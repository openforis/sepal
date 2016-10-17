/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var FormUtils     = require( '../../form/form-utils' )
var Loader        = require( '../../loader/loader' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = $( form )
    FormNotify = Form.find( '.form-notify' )
    
    Form.submit( submit )
}

var submit = function ( e ) {
    e.preventDefault()
    
    var valid = FormValidator.validateForm( Form )
    
    if ( valid ) {
        var data   = Form.serialize()
        var params = {
            url         : '/user/current/details'
            , data      : data
            , beforeSend: function () {
                Loader.show()
            }
            , success   : function ( response ) {
                Loader.hide( { delay: 200 } )
                EventBus.dispatch( Events.USER.USER_DETAILS_LOADED, null, response )
                FormValidator.showSuccess( FormNotify, 'Information saved successfully' )
            }
        }
        EventBus.dispatch( Events.AJAX.POST, null, params )
        // EventBus.dispatch( Events.SECTION.USER.SAVE_USER_DETAILS, null, data )
    }
    
}


var setUser = function ( user ) {
    FormValidator.resetFormErrors( Form, FormNotify )
    FormUtils.populateForm( Form, user )
}

module.exports = {
    init     : init
    , setUser: setUser
}