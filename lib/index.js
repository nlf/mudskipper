var Hoek = require('hoek');
var Router = require('./router');

var internals = {
    top: {},
    defaults: {
        index: {
            method: 'get'
        },
        show: {
            method: 'get'
        },
        new: {
            method: 'get'
        },
        create: {
            method: 'post',
            config: {
                payload: 'parse'
            }
        },
        edit: {
            method: 'get'
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
    var path;
    var route;
    var settings;

    Object.keys(resource).forEach(function (method) {

        path = parents.concat([name]);

        // if it's not one of the allowed methods (this is kind of cheating)
        if (!internals.defaults[method]) return;

        // if we need an id, add it to the path
        if (['show', 'destroy', 'update', 'edit'].indexOf(method) !== -1) path.push('{' + name + '_id}');

        settings = typeof resource[method] === 'function' ? { handler: resource[method] } : resource[method];
        settings.path = '/' + path.join('/');
        route = Hoek.applyToDefaults(internals.defaults[method], settings);
        pack.route(route);
    });
};

exports.register = function _register(pack, options, next) {

    Hoek.assert(typeof options === 'object', 'Options should be an object');
    Hoek.assert(Object.keys(options).length > 0, 'Options must contain at least one key');

    var resource;

    Object.keys(options).forEach(function (option) {

        resource = options[option];

        // first, save each top level object
        internals.top[option] = resource;

        // now let's generate routes for the object
        internals.addResource(pack, option, resource);
    });

    next();
};

