# Sepal Frontend

## Build optimized version

> $ ./build

This builds an optimized version in ./dist

## Run dev server

> $ ./serve

This runs a dev server on <http://localhost:8888/>

## Add javascript dependency

> $ npm install <pkg> --save (or --save-dev if not a runtime dependency)

## Bootstrap configuration

Bootstrap is loaded using [bootstrap-loader](https://github.com/shakacode/bootstrap-loader).
Main configuration is in `./.bootstraprc`, style variables are configured in `./src/bootstrap/customizations.scss` and
 `./src/bootstrap/pre-customizations.scss`.