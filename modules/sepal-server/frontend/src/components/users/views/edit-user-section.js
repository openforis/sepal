/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container        = null
var Form             = null
// Form elements
var BtnStatusActive  = null
var BtnStatusPending = null
var BtnStatusLocked  = null

var selectedUser = null

var init = function ( container ) {
    Container = $( container )
    initForm()
}

var initForm = function () {
    Form = Container.find( 'form' )
    
    BtnStatusActive  = Form.find( '.btn-status-active' )
    BtnStatusPending = Form.find( '.btn-status-pending' )
    BtnStatusLocked  = Form.find( '.btn-status-locked' )
    
    Form.submit( function ( e ) {
        console.log( Form.serialize() )
        e.preventDefault()
    } )
    
    Form.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
    } )
    
    var onBtnStatusClick = function ( e ) {
        var btn    = $( this )
        var status = btn.val()
        
        Form.find( '.btn-status' ).removeClass( 'active' )
        Form.find( '.btn-status-' + status ).addClass( 'active' )
        Form.find( '[name=status]' ).val( status )
    }
    BtnStatusActive.click( onBtnStatusClick )
    BtnStatusPending.click( onBtnStatusClick )
    BtnStatusLocked.click( onBtnStatusClick )
}

var getContainer = function () {
    return Container
}

var selectUser = function ( user ) {
    selectedUser = user
    updateForm()
}

var updateForm = function () {
    var id           = ''
    var name         = ''
    var username     = ''
    var email        = ''
    var organization = ''
    var status       = ''
    
    if ( selectedUser ) {
        id           = selectedUser.id
        name         = selectedUser.name
        username     = selectedUser.username
        email        = selectedUser.email
        organization = selectedUser.organization
        status       = selectedUser.status
    }
    
    Form.find( '[name=id]' ).val( id )
    Form.find( '[name=name]' ).val( name )
    Form.find( '[name=username]' ).val( username )
    // Form.find( '[name=password]' ).val( userDetails.password )
    Form.find( '[name=email]' ).val( email )
    Form.find( '[name=organization]' ).val( organization )
    Form.find( '.btn-status-' + status ).click()
    
    if ( status === 'pending' ) {
        BtnStatusActive.disable()
    } else {
        BtnStatusActive.enable()
    }
}

module.exports = {
    init          : init
    , getContainer: getContainer
    , selectUser  : selectUser
}