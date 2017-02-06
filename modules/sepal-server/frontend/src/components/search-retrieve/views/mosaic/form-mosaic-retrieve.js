/**
 * @author Mino Togna
 */
require( './form-mosaic-retrieve.scss' )

var EventBus       = require( '../../../event/event-bus' )
var Events         = require( '../../../event/events' )
var FormValidator  = require( '../../../form/form-validator' )
var SearchParams   = require( '../../../search/search-params' )
var SceneAreaModel = require( '../../../scenes-selection/scenes-selection-m' )
var BudgetCheck    = require( '../../../budget-check/budget-check' )


var parentContainer = null
var template        = require( './form-mosaic-retrieve.html' )
var html            = $( template( {} ) )

var form       = null
var formNotify = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.mosaic-retrieve' )
    container.append( html )
    
    form       = html.find( 'form' )
    formNotify = html.find( '.form-notify' )
    
    container.find( '.btn-band' ).click( function ( e ) {
        e.preventDefault()
        $( this ).toggleClass( 'active' )
    } )
    
    form.submit( submit )
}

var submit = function ( e ) {
    e.preventDefault()
    FormValidator.resetFormErrors( form )
    
    var valid = FormValidator.validateForm( form )
    if ( valid ) {
        
        var bands = getBands()
        if ( bands.length <= 0 ) {
            
            FormValidator.showError( formNotify, 'At least one band must be selected' )
            
        } else {
            
            var data = {
                bands                  : bands.join( ',' )
                , name                 : form.find( 'input[name=name]' ).val()
                , sceneIds             : SceneAreaModel.getSelectedSceneIds().join( ',' )
                , targetDayOfYearWeight: 0.5
            }
            
            SearchParams.addAoiRequestParameter( data )
            SearchParams.addTargetDayOfYearRequestParameter( data )
            
            var params = {
                url         : '/api/data/mosaic/retrieve'
                , data      : data
                , beforeSend: function () {
                    
                    setTimeout( function () {
                        EventBus.dispatch( Events.ALERT.SHOW_INFO, null, 'The download will start shortly.<br/>You can monitor the progress in the task manager' )
                    }, 100 )
                    
                    EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.COLLAPSE_VIEW )
                }
                , success   : function ( e ) {
                    
                    EventBus.dispatch( Events.SECTION.TASK_MANAGER.CHECK_STATUS )
                    
                }
            }
            EventBus.dispatch( Events.AJAX.POST, null, params )
        }
    }
    
}

var getBands = function () {
    var bands = []
    form.find( '.btn-band.active' ).each( function () {
        var value = $( this ).val()
        bands.push( value )
    } )
    return bands
}

var hide = function ( options ) {
    parentContainer.velocitySlideUp( options )
}

var toggleVisibility = function ( options ) {
    options = $.extend( {}, {
        begin: function ( elements ) {
            BudgetCheck.check( html )
        }
    }, options )
    parentContainer.velocitySlideToggle( options )
}

var reset = function () {
    form.find( '.btn-band' ).removeClass( 'active' )
    form.find( 'input' ).val( '' )
}

module.exports = {
    init              : init
    , hide            : hide
    , toggleVisibility: toggleVisibility
    , reset           : reset
}