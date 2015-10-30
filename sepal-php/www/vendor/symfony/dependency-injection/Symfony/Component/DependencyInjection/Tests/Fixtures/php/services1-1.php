<?php
namespace Symfony\Component\DependencyInjection\Dump;

use Symfony\Component\DependencyInjection\ParameterBag\ParameterBag;

/**
 * Container
 *
 * This class has been auto-generated
 * by the Symfony Dependency Injection Component.
 */
class Container extends AbstractContainer
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
