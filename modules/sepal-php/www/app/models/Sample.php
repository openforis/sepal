<?php
Class Sample extends Eloquent {
	
    protected $table = 'image_log';
    public $timestamps = false;
    protected $fillable = array('name','last_accessed');

}
