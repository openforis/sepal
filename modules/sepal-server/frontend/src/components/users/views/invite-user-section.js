/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var FormUtils     = require( '../../form/form-utils' )
var Loader        = require( '../../loader/loader' )

var Container = null
var Form      = null

var init = function ( container ) {
    Container = $( container )
    Form      = Container.find( 'form' )
    
    initForm()
}

var initForm = function () {
    Form.submit( submitForm )
    
    Form.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        
        FormUtils.resetForm( Form )
        EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
    } )
}

var submitForm = function ( e ) {
    e.preventDefault()
    
    var valid = FormValidator.validateForm( Form )
    
    if ( valid ) {
        // submit
        var data = Form.serialize()
        
        var params = {
            url         : '/api/user/invite'
            , data      : data
            , beforeSend: function () {
                Loader.show()
            }
            , success   : function ( response ) {
                Loader.hide( { delay: 200 } )
                
                FormValidator.showSuccess( Form.find( '.form-notify' ), "User invited" )
                
                setTimeout( function () {
                    EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
                }, 1600 )
            }
            
        }
        
        EventBus.dispatch( Events.AJAX.POST, this, params )
    }
}

var getContainer = function () {
    return Container
}

module.exports = {
    init          : init
    , getContainer: getContainer
}