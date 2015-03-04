var Hoek = require('hoek');
var Inflection = require('inflection');

// Defaults for the methods
var Mudskipper = function (options) {

    this.makeRoutes = options.makeRoutes || function () {
        throw new Error('makeRoutes not defined in mudskipper config');
    };

    this.internals = {
        routes: [],
        resources: {},
        dependencies: {},
        options: {},
        namespace: '',
        defaults: {
            index: {
                method: 'get',
                config: {
                    bind: {}
                }
            },
            show: {
                method: 'get',
                config: {
                    bind: {}
                }
            },
            create: {
                method: 'post',
                config: {
                    bind: {}
                }
            },
            update: {
                method: 'put',
                config: {
                    bind: {}
                }
            },
            patch: {
                method: 'patch',
                config: {
                    bind: {}
                }
            },
            destroy: {
                method: 'delete',
                config: {
                    bind: {}
                }
            }
        }
    };
};

// a helper function to recurse through all the resources
// and save their dependencies so we can find children later
Mudskipper.prototype.saveDependencies = function _saveDependencies(name, obj) {

    this.internals.dependencies[name] = { hasOne: [], hasMany: [] };

    var parse = function _parse(prop) {
        if (!Array.isArray(obj[prop])) {
            obj[prop] = [obj[prop]];
        }

        for (var i = 0, l = obj[prop].length; i < l; i++) {
            var child = obj[prop][i];
            if (typeof child !== 'string') {
                Hoek.assert(Object.keys(child).length === 1, 'Child object must contain only one property');

                var childName = Object.keys(child)[0];
                this.internals.dependencies[name][prop].push(childName);
                this.internals.resources[childName] = child[childName];
                this.internals.resources[childName].childOnly = true;
                this.saveDependencies(childName, child[childName]);
                delete this.internals.resources[childName].hasOne;
                delete this.internals.resources[childName].hasMany;
            }
            else {
                this.internals.dependencies[name][prop].push(obj[prop][i]);
            }
        }
    }.bind(this);

    if (obj.hasOne) {
        parse('hasOne');
    }

    if (obj.hasMany) {
        parse('hasMany');
    }
};

// the first pass goes through all keys, and makes sure that the hasOne
// and hasMany properties are arrays of strings. if objects are found,
// they are copied to internals.resources with the childOnly flag set
// to true, so as to prevent a top level route being created for them.
// all other objects are copied to internals.resources with the hasOne
// and hasMany keys removed.
Mudskipper.prototype.firstPass = function _firstPass() {

    for (var key in this.internals.options) {
        var resource = this.internals.options[key];
        this.internals.dependencies[key] = {};
        this.saveDependencies(key, resource);
        this.internals.resources[key] = resource;
        delete this.internals.resources[key].hasOne;
        delete this.internals.resources[key].hasMany;
    }

    this.secondPass();
};

// the second pass generates routes for all resources that
// have top level routes (i.e. the childOnly flag is *not* set)
// additionally, it ensures that methods for all resources are
// an object containing a handler property set to a function
Mudskipper.prototype.secondPass = function _secondPass() {

    for (var key in this.internals.resources) {
        var resource = this.internals.resources[key];

        if (key === 'root') {
            if (typeof resource === 'function') {
                resource = { handler: resource };
            }

            var settings = Hoek.applyToDefaults(this.internals.defaults.index, resource);
            settings.path = '/' + (this.internals.namespace ? this.internals.namespace : '');
            delete settings.collectionLinks;
            delete settings.itemLinks;
            this.internals.routes.push(settings);
            continue;
        }

        if (resource.childOnly) {
            continue;
        }

        var children = this.findChildren(key);
        var hasOneKeys = Object.keys(children.hasOne);
        var hasManyKeys = Object.keys(children.hasMany);
        var objectPath = this.generateRoute(key, 'show', false, []);

        for (var method in resource) {
            if (['index', 'create', 'show', 'update', 'patch', 'destroy'].indexOf(method) === -1) {
                continue;
            }

            if (typeof resource[method] === 'function') {
                resource[method] = { handler: resource[method] };
            }

            settings = Hoek.applyToDefaults(this.internals.defaults[method], resource[method]);
            if (settings.config && settings.config.validate && settings.config.validate.path) {
                delete settings.config.validate.path;
            }

            settings.path = '/' + this.generateRoute(key, method, false, []).join('/');

            delete settings.itemLinks;
            delete settings.collectionLinks;
            this.internals.routes.push(settings);
        }

        if (hasOneKeys.length) {
            this.addChild(resource, objectPath, children.hasOne, true);
        }

        if (hasManyKeys.length) {
            this.addChild(resource, objectPath, children.hasMany, false);
        }
    }

    this.makeRoutes(this.internals.routes);

    // reset this.internals
    this.internals.routes = [];
    this.internals.resources = {};
    this.internals.dependencies = {};
    this.internals.options = {};
    this.internals.namespace = '';
};

// a helper function to recursively find children from a given parent
Mudskipper.prototype.findChildren = function _findChildren(parent, children, parents) {

    children = children || { hasOne: {}, hasMany: {} };
    parents = parents || [parent];
    if (!children.hasOne[parent] && !children.hasMany[parent]) {
        children.hasOne[parent] = { hasOne: {}, hasMany: {} };
    }

    var deps = this.internals.dependencies[parent];
    var child;

    var addChildren = function _addChildren(prop) {
        for (var i = 0, l = deps[prop].length; i < l; i++) {
            if (parents.indexOf(deps[prop][i]) !== -1) {
                continue;
            }

            children[prop][deps[prop][i]] = this.findChildren(deps[prop][i], children[prop][parent], parents.concat([deps[prop][i]]));
        }
    }.bind(this);

    if (deps) {
        if (deps.hasOne) {
            addChildren('hasOne');
        }

        if (deps.hasMany) {
            addChildren('hasMany');
        }
    }

    delete children.hasOne[parent];

    return children;
};

Mudskipper.prototype.generateRoute = function _generateRoute(name, method, singular, path) {

    var segments;

    if (path.length) {
        segments = [].concat(path);
    }
    else {
        if (this.internals.namespace && (!this.internals.resources[name].path || this.internals.resources[name].path[0] !== '/')) {
            segments = [this.internals.namespace];
        }
        else {
            segments = [];
        }
    }

    var nextSegment = '';

    if (singular) {
        nextSegment = Inflection.singularize(name);
    }

    if (this.internals.resources[name].path) {
        if (this.internals.resources[name].path[0] === '/') {
            nextSegment = this.internals.resources[name].path.slice(1).split('/');
        }
        else {
            nextSegment = this.internals.resources[name].path.split('/');
        }
        segments = segments.concat(nextSegment);
    }
    else {
        segments.push(nextSegment || name);
    }

    nextSegment = '';
    if (this.internals.uniqueIds === false) {
        if (path.length) {
            path.forEach(function (p) {
                if (p.charAt(0) === '{') {
                    nextSegment = 'sub' + nextSegment[0].toUpperCase() + nextSegment.slice(1);
                }
            });
        }
    }
    else {
        nextSegment = Inflection.singularize(name);
    }
    nextSegment = '{' + nextSegment + 'Id}';

    if (method !== 'index' && method !== 'create' && !singular) {
        segments.push(nextSegment);
    }

    return segments;
};

Mudskipper.prototype.addChild = function _addChild(parent, path, child, singular) {

    var stripHandlers = function (obj) {
        var result = Hoek.clone(obj);
        for (var m in result) {
            if (result[m].handler) {
                delete result[m].handler;
            }
        }
        return result;
    };

    parent = stripHandlers(parent);

    for (var i = 0, l = Object.keys(child).length; i < l; i++) {
        var childName = Object.keys(child)[i];
        var hasOneKeys = Object.keys(child[childName].hasOne);
        var hasManyKeys = Object.keys(child[childName].hasMany);
        var objectPath = this.generateRoute(childName, 'show', singular, path);

        for (var method in this.internals.resources[childName]) {
            if (!singular) {
                if (['index', 'create', 'show', 'update', 'patch', 'destroy'].indexOf(method) === -1) {
                    continue;
                }
            }
            else {
                if (['show', 'update', 'patch', 'destroy'].indexOf(method) === -1) {
                    continue;
                }
            }

            if (typeof this.internals.resources[childName][method] === 'function') {
                this.internals.resources[childName][method] = { handler: this.internals.resources[childName][method] };
            }

            var settings = parent && parent[method] ? Hoek.merge(parent[method], this.internals.resources[childName][method]) : this.internals.resources[childName][method];
            if (settings.config && settings.config.validate && settings.config.validate.path) {
                delete settings.config.validate.path;
            }

            var route = Hoek.applyToDefaults(this.internals.defaults[method], settings);

            route.path = '/' + this.generateRoute(childName, method, singular, path).join('/');

            delete route.itemLinks;
            delete route.collectionLinks;
            this.internals.routes.push(route);
        }

        if (hasOneKeys.length) {
            this.addChild(settings, objectPath, child[childName].hasOne, true);
        }

        if (hasManyKeys.length) {
            this.addChild(settings, objectPath, child[childName].hasMany, false);
        }
    }
};

Mudskipper.prototype.buildRoutes = function _buildRoutes(options, next) {

    Hoek.assert(typeof options === 'object', 'Options must be defined as an object');
    Hoek.assert(options.hasOwnProperty('namespace') ? typeof options.namespace === 'string' : true, 'Namespace must be a string');

    this.internals.options = options.resources;
    this.internals.uniqueIds = options.hasOwnProperty('uniqueIds') ? options.uniqueIds : true;
    this.internals.namespace = options.hasOwnProperty('namespace') ? options.namespace : '';
    if (Object.keys(this.internals.options).length) {
        this.firstPass();
    }
    next();
};

module.exports = Mudskipper;

module.exports.register = function (plugin, options, next) {

    var mudskipper = new Mudskipper({
        makeRoutes: plugin.route.bind(plugin)
    });

    options.resources = options.resources || {};
    plugin.expose({ route: mudskipper.buildRoutes.bind(mudskipper) });
    mudskipper.buildRoutes(options, next);
};

module.exports.register.attributes = {
    pkg: require('./package.json'),
    multiple: true
};
