/**
 * @author Mino Togna
 */

require( './section-active-mosaics-list.scss' )

var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var Dialog   = require( '../../dialog/dialog' )

var container = null
var btnList   = null

var listMosaics  = {}
var activeMosaic = null
var btnSave      = null

var init = function ( c ) {
    container = $( c )
    btnList   = container.find( '.active-mosaics-btns' )
    btnSave   = container.find( '.btn-save' )
    
    btnSave.click( function ( e ) {
        e.preventDefault()
        var options = {
            message    : 'Save ' + activeMosaic.name + ' ?'
            , onConfirm: function () {
                //TODO
                console.log( activeMosaic )
            }
        }
        Dialog.show( options )
    } )
}

var setActiveState = function ( e, state ) {
    addMosaic( state )
    
    btnList.find( 'button' ).removeClass( 'active' )
    
    var btn = btnList.find( 'button.btn-mosaic-' + state.name )
    btn.addClass( 'active' )
    btnSave.insertAfter( btn )
    activeMosaic = btn.data( 'mosaic' )
}
EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGED, setActiveState )

//TODO USE ID instead of name
var addMosaic = function ( state ) {
    if ( !listMosaics[ state.name ] ) {
        listMosaics[ state.name ] = state
        
        var name = state.name
        var btn  = $( '<button class="btn btn-base btn-mosaic"></button>' )
        btn.addClass( 'btn-mosaic-' + name )
        btn.data( 'mosaic' , state )
        btn.html( name )
        btn.click( function ( e ) {
            e.preventDefault()
            
            if ( !btn.hasClass( 'active' ) ) {
                EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGE, null, listMosaics[ name ] )
            }
        } )
        
        btnList.append( btn )
        // btnList.append( btn.clone().removeClass('active') )
        // btnList.append( btn.clone().removeClass('active') )
        // btnList.append( btn.clone().removeClass('active') )
    }
}

module.exports = {
    init            : init
}