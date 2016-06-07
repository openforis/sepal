/**
 * @author Mino Togna
 */
require( './tasks.css' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Animation = require( '../animation/animation' )
// html
var template  = require( './tasks.html' )
var html      = $( template( {} ) )

var rowTask   = html.find( '.row.task' )
var rowHeader = html.find( '.row.row-header' )
var container = html.find( '.tasks-container' )

var init = function () {
    var appSection = $( '#app-section' ).find( '.tasks' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
    }
}

var reset = function () {
    container.find( '.task' ).remove()
}

var setTasks = function ( tasks ) {
    $.each( tasks, function ( i, task ) {
        var row = getTaskRow( i, task )
        row.find( '.status' ).html( task.status )
    } )
}

var getTaskRow = function ( index, task ) {
    var taskUIRow = container.find( '.task-' + task.id )
    if ( taskUIRow.length ) {
    } else {
        taskUIRow = rowTask.clone()
        taskUIRow.addClass( 'task-' + task.id )
        taskUIRow.find( '.name' ).html( task.name )
        container.append( taskUIRow )
        
        setTimeout( function () {
            Animation.animateIn( taskUIRow )
        }, index * 50 )
    }
    return taskUIRow
}

module.exports = {
    init      : init
    , reset   : reset
    , setTasks: setTasks
} 
