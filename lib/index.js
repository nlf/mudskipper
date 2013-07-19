var Hoek = require('hoek');
var Inflection = require('inflection');

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

internals.addResource = function _addResource(pack, name, resource, parents) {

    // function to add routes for one resource

    // make sure parents is an array. we'll use this to build the path later
    if (!parents) parents = [];
    var singular = Inflection.singularize(name);
    var path;
    var route;
    var settings;

    Object.keys(resource).forEach(function _eachMethod(method) {

        path = parents.concat([name]);

        // if it's not one of the allowed methods (this is kind of cheating)
        if (!internals.defaults[method]) return;

        // if we need an id, add it to the path
        if (['show', 'destroy', 'update'].indexOf(method) !== -1) path.push('{' + singular + '_id}');

        settings = typeof resource[method] === 'function' ? { handler: resource[method] } : resource[method];
        settings.path = '/' + path.join('/');
        route = Hoek.applyToDefaults(internals.defaults[method], settings);
        pack.route(route);
    });

    if (resource.children) {

        Hoek.assert(Array.isArray(resource.children), 'Resource children must be specified as an array');

        resource.children.forEach(function (child) {
            var newparents = parents.concat([name, '{' + singular + '_id}']);
            if (typeof child === 'string') {

                Hoek.assert(internals.top.hasOwnProperty(child), 'Child "' + child + '" was not found');

                internals.addResource(pack, child, internals.top[child], newparents);
            } else {

                Hoek.assert(Object.keys(child).length === 1, 'You may only specify one child per array member');

                var childkey = Object.keys(child)[0];
                var childsettings = child[childkey];
                internals.addResource(pack, childkey, childsettings, newparents);
            }
        });
    }
};

exports.register = function _register(pack, options, next) {

    Hoek.assert(typeof options === 'object', 'Options should be an object');
    Hoek.assert(Object.keys(options).length > 0, 'Options must contain at least one key');

    var resource;

    Object.keys(options).forEach(function _eachResource(option) {

        resource = options[option];

        // first, save each top level object
        internals.top[option] = resource;

        // now let's generate routes for the object
        internals.addResource(pack, option, resource);
    });

    next();
};

