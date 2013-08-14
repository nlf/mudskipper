var Hoek = require('hoek');
var Inflection = require('inflection');

// declare internals
// this includes defaults for each method
//
var internals = {
    top: {},
    defaults: {
        index: {
            method: 'get'
        },
        show: {
            method: 'get'
        },
        create: {
            method: 'post',
            config: {
                payload: 'parse'
            }
        },
        update: {
            method: 'put',
            config: {
                payload: 'parse'
            }
        },
        destroy: {
            method: 'delete'
        }
    }
};

// function to add routes for one resource
//
internals.addResource = function _addResource(pack, name, resource, parents, parentsettings) {

    // make sure parents is an array. we'll use this to build the path later
    if (!parents) parents = [];
    // singularize the resource name for the _id parameters
    var singular = Inflection.singularize(name).replace(/[^\w]/g, '');
    var path;
    var route;
    var settings;

    // loop over each defined method
    Object.keys(resource).forEach(function _eachMethod(method) {

        path = parents.concat([name]);

        // don't process children, we do that later
        if (method === 'children') return;

        // if we need an id, add it to the path
        if (['show', 'destroy', 'update'].indexOf(method) !== -1) path.push('{' + singular + '_id}');

        // if we only got a function, define it as the handler
        settings = typeof resource[method] === 'function' ? { handler: resource[method] } : resource[method];
        if (resource[method].hasOwnProperty('path')) {
            if (resource[method].path.indexOf('/') === 0) {
                if (parents.length) {
                    settings.path = '/' + parents.join('/') + resource[method].path;
                } else {
                    settings.path = resource[method].path;
                }
            } else {
                settings.path = '/' + path.join('/') + '/' + resource[method].path;
            }
        } else {
            settings.path = '/' + path.join('/');
        }

        // apply the defaults from internals for the method
        if (internals.defaults.hasOwnProperty(method)) {
            route = Hoek.applyToDefaults(internals.defaults[method], settings);
        } else {
            route = Hoek.applyToDefaults({ method: 'get' }, settings);
        }


        if (parentsettings) {
            // we need to go back and add the 'show' method's config for parent objects
            if (!route.config) route.config = {};
            parentsettings.forEach(function (parentsetting) {
                route.config = Hoek.merge(route.config, parentsetting);
            });
        }

        // and then add the route
        pack.route(route);
    });

    // if children are defined
    if (resource.children) {

        Hoek.assert(Array.isArray(resource.children), 'Resource children must be specified as an array');

        // loop over each one
        resource.children.forEach(function _eachChild(child) {
            var newparents = parents.concat([name, '{' + singular + '_id}']);
            var newparentsettings;

            // we store the config object for the show method of each parent in an array
            // to be passed on to the child
            if (!parentsettings) parentsettings = [];
            if (resource.show && resource.show.config) newparentsettings = parentsettings.concat([resource.show.config]);

            if (typeof child === 'string') {
                
                // user gave a string, so let's make sure it's a top level resource
                Hoek.assert(internals.top.hasOwnProperty(child), 'Child "' + child + '" was not found');

                internals.addResource(pack, child, internals.top[child], newparents, newparentsettings);
            } else {

                // user gave an object, so let's treat it like its own resource but we only allow ONE
                // resource per array member
                Hoek.assert(Object.keys(child).length === 1, 'You may only specify one child per array member');

                var childkey = Object.keys(child)[0];
                var childsettings = child[childkey];
                internals.addResource(pack, childkey, childsettings, newparents, newparentsettings);
            }
        });
    }
};

exports.register = function _register(pack, options, next) {

    Hoek.assert(typeof options === 'object', 'Options should be an object');
    Hoek.assert(Object.keys(options).length > 0, 'Options must contain at least one key');

    var resource;

    // loop over each top level resource
    Object.keys(options).forEach(function _eachResource(option) {

        resource = options[option];

        // first, save each top level object
        internals.top[option] = Hoek.clone(resource);

        // now let's generate routes for the object
        internals.addResource(pack, option, resource);
    });

    next();
};

