<?php

use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\DependencyInjection\ParameterBag\ParameterBag;

/**
 * ProjectServiceContainer
 *
 * This class has been auto-generated
 * by the Symfony Dependency Injection Component.
 */
class ProjectServiceContainer extends Container
{
    private $parameters;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->parameters = array(

        );

        parent::__construct(new ParameterBag($this->parameters));
    }
}
