<?php


class Role extends Eloquent  {

	/**
	 * The database table used by the model.
	 *
	 * @var string
	 */
	protected $table = 'roles';

	/**
	 * Setting the relationship with user through users_roles table
	 *
	 * @return mixed
	 */
	public function users() 
	{
        	return $this->belongsToMany('User','users_roles');    
    	}

}
