/**
 * @author Mino Togna
 */

require( './browse.css' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var Loader   = require( '../loader/loader' )
var Model    = require( './browse-m' )

// html
var template         = require( './browse.html' )
var html             = $( template( {} ) )
var browseContentRow = null
var downloadBtn      = null
var lastAbsPathClick = null

var init = function () {
    var appSection = $( '#app-section' ).find( '.browse' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        
        browseContentRow = html.find( '.browse-content-row' )
        downloadBtn      = html.find( '.btn-download' )
        downloadBtn.click( function ( e ) {
            e.preventDefault()
            EventBus.dispatch( Events.SECTION.BROWSE.DOWNLOAD_ITEM, null, lastAbsPathClick )
        } )

        setTimeout( function () {
            setContentSize()
        }, 1500 )

        $( window ).resize( function () {
            setContentSize()
        } )

    }
}

var setContentSize = function () {
    browseContentRow.width( browseContentRow.parent().width() + 'px' )
    browseContentRow.height( browseContentRow.parent().height() + 'px' )
}

var addDir = function ( dir ) {
    browseContentRow.find( '.level-' + dir.level ).nextAll().andSelf().remove()
    
    // var colLevel = $( '<td class="height100 level-' + dir.level + '" />' )
    var colLevel = $( '<div class="col-smd-3 height100 level level-' + dir.level + '" />' )
    browseContentRow.append( colLevel )
    
    var rowH = $( '<div class="row dir-header height10"/>' )
    colLevel.append( rowH )
    var colH = $( '<div class="col-sm-12 text-align-center height100"/>' )
    colH.append( dir.path )
    rowH.append( colH )
    
    var rowC = $( '<div class="row dir-content height90"/>' )
    colLevel.append( rowC )
    var colC = $( '<div class="col-sm-12 text-align-left overflow-auto height100"/>' )
    rowC.append( colC )
    
    if ( dir.children.length <= 0 ) {
        var childDivR = $( '<div class="row dir-child"/>' )
        colC.append( childDivR )
        var childDivC = $( '<div class="col-sm-12">&nbsp;</div>' )
        childDivR.append( childDivC )
    }

    $.each( dir.children, function ( i, child ) {
        var childDivR = $( '<div class="row dir-child"/>' )
        colC.append( childDivR )
        var childDivC = $( '<div/>' )
        childDivC.append( child.name )
        childDivR.append( childDivC )
        
        if ( child.isDirectory === true ) {
            childDivC.addClass( 'col-sm-11' )
            var childDivL = $( '<div class"col-sm-1"/>' )
            childDivL.append( '<i class="fa fa-caret-right" aria-hidden="true"></i>' )
            childDivR.append( childDivL )
        } else {
            childDivC.addClass( 'col-sm-12' )
        }
        
        childDivR.click( function ( e ) {
            colC.find( 'div.row.dir-child.active' ).removeClass( 'active' )
            childDivR.addClass( 'active' )
            
            EventBus.dispatch( Events.SECTION.BROWSE.NAV_ITEM_CLICK, null, dir.level, child )
            
            var absPath      = Model.absolutePath( dir.level, child.name )
            absPath          = absPath.substring( 0, absPath.length - 1 )
            lastAbsPathClick = absPath
            downloadBtn.html( '<i class="fa fa-download" aria-hidden="true"></i>' + absPath )
            downloadBtn.fadeIn()
        } )
        
    } )
    
    colLevel.velocity( 'scroll', {
        container : browseContentRow
        , duration: 200
        , delay   : 100
        , axis    : "x"
    } )
    
}

module.exports = {
    init    : init
    , addDir: addDir
}