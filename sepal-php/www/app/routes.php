<?php

/*
  |--------------------------------------------------------------------------
  | Application Routes
  |--------------------------------------------------------------------------
  |
  | Here is where you can register all of the routes for an application.
  | It's a breeze. Simply tell Laravel the URIs it should respond to
  | and give it the Closure to execute when that URI is requested.
  |
 */

/*
Event::listen('illuminate.query', function($query)
{
  print_r($query);
});
*/
//Route for cronjob
Route::get('tiffvalidator', 'UsgstiffController@cronTiffValidator');
Route::get('cleartemprepo', 'DashboardController@clearTempDownloadRepo');//clear temp repo(download folder) every 5 hours
Route::get('removefile', 'SearchController@removeImages');//to delete the repo date limit set by admin
//Route filter for guest in users access
Route::group(array('before' => 'guest'), function () {
    Route::get('/', 'LoginController@index');
    Route::get('login', 'LoginController@index');
    Route::post('login', 'LoginController@check');
});

//Route filter for logged in users
Route::group(array('before' => 'auth'), function () {

    Route::get('/', 'DashboardController@showDashboard');
    Route::get('dashboard', 'DashboardController@showDashboard');
    Route::post('showfolder', 'DashboardController@showFolders');
    Route::post('subfolder', 'DashboardController@showSubFolders');
    Route::get('terminal', 'SshController@ssh');
    Route::get('terminalData','SshController@requestSshSession');
    Route::get('visualize', 'VisualizeController@showVisualization');
    //config
    Route::get('cronsetupbydays', 'DashboardController@cronSetupForm');
    Route::post('cronsetupbydays', 'DashboardController@cronSetupForm');

    //search routes
    Route::get('search', 'SearchController@showForm');
    Route::get('searchresults', 'SearchController@searchDatabase');
    Route::get('searchresults/{identifier}/{beginPath}/{endPath}/{beginRow}/{endRow}/{topLeftLatitude01}/{topLeftLongitude01}
                /{bottomRightLatitude01}/{bottomRightLongitude01}/{sensor}/
    {sceneStartTime}/{sceneStopTime}/{name}/{cloud_cover}/{topLeftLatitude}/{topLeftLongitude}
    /{bottomRightLatitude}/{bottomRightLongitude}/{page}', 'SearchController@searchDatabase');
    Route::post('search', 'SearchController@searchDatabase');
    Route::post('imagerepo', 'SearchController@imageRepo');

    Route::post('pathtolatlong', 'SearchController@pathtoLatLong');
    Route::post('findcenter', 'SearchController@adjustZoom');
    //Route::post('migrate', 'SearchController@copyImages');

    Route::get('contact', 'ContactusController@contactUs');
    Route::post('contact', 'ContactusController@contact');
    Route::get('password', 'DashboardController@changePassword');
    Route::post('password', 'DashboardController@checkPassword');

    Route::post('tiffstatus', 'UsgstiffController@checkTiff');

    Route::post('migrate', 'SepalGeoServerController@requestDownload');
    Route::get('migrate', 'SepalGeoServerController@requestDownload');

    Route::get('logout', 'LoginController@logout');
    //Routes for groups
    Route::resource('groups', 'GroupsController');
    Route::post('groups', 'GroupsController@create');

    Route::get('groups/edit/{id}', 'GroupsController@edit');
    Route::post('groups/edit/{id}', 'GroupsController@update');
    Route::get('groups/del/{id}', 'GroupsController@removeGroup');


    //download data
    Route::get('downloadfile/{filePath}', 'DashboardController@downloadFileFromDashboard');
    Route::post('compressfolder', 'DashboardController@createZipFromDashboard');
    Route::get('downloadtar/{filePath}', 'DashboardController@downloadZipFromDashboard');


    Route::post('migratecheck', 'DashboardController@migrateCheck');

    Route::get('migrationstatus', 'SepalGeoServerController@showDownloadStatus');
    Route::get('downloadstatus', 'SepalGeoServerController@loadDownloadStatus');
    Route::post('migrationchecker', 'DashboardController@migrationChecker'); //make it as post
    Route::get('removeFromDashboard', 'SepalGeoServerController@removeFromDashboard');

    //Manage groups
    Route::post('disablegroup', 'GroupsController@insert');
    Route::post('enablegroup', 'GroupsController@delete');
    //Routes for users
    Route::resource('users', 'UsersController');
    Route::post('users', 'UsersController@index');
    Route::get('adduser', 'UsersController@add');
    Route::post('createuser', 'UsersController@create');
    Route::post('removegroup', 'UsersController@removeGroup');
    Route::get('users/edit/{id}', 'UsersController@edit');
    Route::post('users/edit/{id}', 'UsersController@update');
    Route::get('users/del/{id}', 'UsersController@removeUser');
});
