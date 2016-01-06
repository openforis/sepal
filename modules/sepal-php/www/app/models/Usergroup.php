<?php


class Usergroup extends Eloquent  {

	/**
	 * The database table used by the model.
	 *
	 * @var string
	 */
	protected $table = 'users_groups';

	/**
	 * Setting the relationship with user through users_roles table
	 *
	 * @return mixed
	 */
	public function users() 
	{
        	return $this->belongsToMany('User','users_roles');    
    }
	
	public function usernames() 
	{
        	return $this->belongsTo('User','user_id'); 
    }


}
