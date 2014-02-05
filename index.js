var Hoek = require('hoek');
var Inflection = require('inflection');

// Defaults for the methods
function Mudskipper(options) {
    this.makeRoutes = options.makeRoutes || function () {
        throw new Error("makeRoutes not defined in mudskipper config");
    };

    this.internals = {
        hypermedia: {},
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
}

// a helper function to recurse through all the resources
// and save their dependencies so we can find children later
Mudskipper.prototype.saveDependencies = function _saveDependencies(name, obj) {
    var child, childName;
    this.internals.dependencies[name] = { hasOne: [], hasMany: [] };

    var parse = function _parse(prop) {
        if (!Array.isArray(obj[prop])) obj[prop] = [obj[prop]];
        for (var i = 0, l = obj[prop].length; i < l; i++) {
            child = obj[prop][i];
            if (typeof child !== 'string') {
                Hoek.assert(Object.keys(child).length === 1, 'Child object must contain only one property');

                childName = Object.keys(child)[0];
                this.internals.dependencies[name][prop].push(childName);
                this.internals.resources[childName] = child[childName];
                this.internals.resources[childName].childOnly = true;
                this.saveDependencies(childName, child[childName]);
                delete this.internals.resources[childName].hasOne;
                delete this.internals.resources[childName].hasMany;
            } else {
                this.internals.dependencies[name][prop].push(obj[prop][i]);
            }
        }
    }.bind(this);

    if (obj.hasOne) parse('hasOne');
    if (obj.hasMany) parse('hasMany');
};

// the first pass goes through all keys, and makes sure that the hasOne
// and hasMany properties are arrays of strings. if objects are found,
// they are copied to internals.resources with the childOnly flag set
// to true, so as to prevent a top level route being created for them.
// all other objects are copied to internals.resources with the hasOne
// and hasMany keys removed.
Mudskipper.prototype.firstPass = function _firstPass() {
    var key, resource, child, childName, i, l;

    for (key in this.internals.options) {
        resource = this.internals.options[key];
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
    var key, resource, method, settings, objectPath, children, hasOneKeys, hasManyKeys, hypermedia;

    for (key in this.internals.resources) {
        resource = this.internals.resources[key];
        hypermedia = this.generateHypermedia(key, [], false);

        if (key === 'root') {
            if (typeof resource === 'function') resource = { handler: resource };
            settings = Hoek.applyToDefaults(this.internals.defaults.index, resource);
            settings.path = '/' + (this.internals.namespace ? this.internals.namespace : '');
            settings.config.bind.hypermedia = hypermedia.collection;
            delete settings.collectionLinks;
            delete settings.itemLinks;
            this.internals.routes.push(settings);
            continue;
        }

        if (resource.childOnly) continue;
        children = this.findChildren(key);
        hasOneKeys = Object.keys(children.hasOne);
        hasManyKeys = Object.keys(children.hasMany);
        objectPath = this.generateRoute(key, 'show', false, []);

        for (method in resource) {
            if (['index', 'create', 'show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;

            if (typeof resource[method] === 'function') resource[method] = { handler: resource[method] };

            settings = Hoek.applyToDefaults(this.internals.defaults[method], resource[method]);
            if (settings.config && settings.config.validate && settings.config.validate.path) delete settings.config.validate.path;
            settings.path = '/' + this.generateRoute(key, method, false, []).join('/');
            if (method === 'index') {
                settings.config.bind.hypermedia = hypermedia.collection;
            } else if (method === 'show') {
                settings.config.bind.hypermedia = hypermedia.item;
            }
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
    this.internals.hypermedia = {};
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
    if (!children.hasOne[parent] && !children.hasMany[parent]) children.hasOne[parent] = { hasOne: {}, hasMany: {} };
    var deps = this.internals.dependencies[parent];
    var child;

    var addChildren = function _addChildren(prop) {
        for (var i = 0, l = deps[prop].length; i < l; i++) {
            if (parents.indexOf(deps[prop][i]) !== -1) continue;
            children[prop][deps[prop][i]] = this.findChildren(deps[prop][i], children[prop][parent], parents.concat([deps[prop][i]]));
        }
    }.bind(this);

    if (deps) {
        if (deps.hasOne) addChildren('hasOne');
        if (deps.hasMany) addChildren('hasMany');
    }

    delete children.hasOne[parent];

    return children;
};

Mudskipper.prototype.generateHypermedia = function _generateHypermedia(name, path, singular, parent) {
    var resource = this.internals.resources[name];
    var hypermedia = {};
    var newpath;

    if (name === 'root') {
        if (this.internals.namespace) {
            newpath = '/' + this.internals.namespace;
        } else {
            newpath = '/';
        }

        hypermedia.collection = {
            methods: ['get'],
            links: { self: { href: newpath }, up: { href: newpath } },
            items: {}
        };

        Object.keys(this.internals.resources).forEach(function (key) {
            if (this.internals.resources[key].childOnly || key === 'root') return;
            if (this.internals.resources[key].path) {
                newpath = this.internals.resources[key].path;
                if (this.internals.resources[key].path[0] === '/') {
                    hypermedia.collection.links[key] = { href: newpath };
                } else {
                    if (this.internals.namespace) {
                        newpath = '/' + this.internals.namespace + '/' + newpath;
                    }
                    hypermedia.collection.links[key] = { href: newpath };
                }
            } else {
                newpath = '/' + key;
                if (this.internals.namespace) {
                    newpath = '/' + this.internals.namespace + newpath;
                }
                hypermedia.collection.links[key] = { href: newpath };
            }
        }.bind(this));
        if (resource.collectionLinks) hypermedia.collection.links = Hoek.merge(hypermedia.collection.links, resource.collectionLinks);
        return hypermedia;
    }

    var hasOne = this.internals.dependencies[name].hasOne;
    var hasMany = this.internals.dependencies[name].hasMany;
    var rootPath = '/' + this.generateRoute(name, 'index', singular, path).join('/');
    var itemPath = '/' + this.generateRoute(name, 'show', singular, path).join('/');
    var href, methods, upPath, singularParent;

    if (!parent) {
        if (this.internals.namespace) {
            upPath = '/' + this.internals.namespace;
        } else {
            upPath = '/';
        }
    } else {
        singularParent = path[path.length - 1].indexOf('{') === -1;

        if (singularParent) {
            if (parent.index || parent.create) {
                upPath = '/' + path.slice(0, -1).join('/');
            } else {
                upPath = '/' + path.join('/');
            }
        } else {
            if (parent.show || parent.update || parent.patch || parent.destroy) {
                upPath = '/' + path.join('/');
            } else {
                upPath = '/' + path.slice(0, -1).join('/');
            }
        }
    }

    if (!singular) {
        hypermedia.collection = {
            methods: [],
            links: {},
            items: {}
        };
        if (resource.index) hypermedia.collection.methods.push('get');
        if (resource.create) hypermedia.collection.methods.push('post');
        hypermedia.collection.links.self = { href: rootPath };
        hypermedia.collection.links.up = { href: upPath };
        if (resource.show || resource.destroy || resource.update || resource.patch) hypermedia.collection.links.item = { href: itemPath };
        if (resource.collectionLinks) hypermedia.collection.links = Hoek.merge(hypermedia.collection.links, resource.collectionLinks);
    }

    hypermedia.item = {
        methods: [],
        links: {},
        items: {}
    };
    if (resource.show) hypermedia.item.methods.push('get');
    if (resource.update) hypermedia.item.methods.push('put');
    if (resource.patch) hypermedia.item.methods.push('patch');
    if (resource.destroy) hypermedia.item.methods.push('delete');
    hypermedia.item.links.self = { href: (singular || (!resource.show && !resource.update && !resource.patch && !resource.destroy)) ? rootPath : itemPath };
    hypermedia.item.links.up = { href: (singular || (!resource.index && !resource.create)) ? upPath : rootPath };
    if (resource.itemLinks) hypermedia.item.links = Hoek.merge(hypermedia.item.links, resource.itemLinks);

    if (hasOne.length) {
        hasOne = hasOne.filter(function (key) {
            return path.indexOf(key) === -1 && path.indexOf(Inflection.singularize(key)) === -1;
        });
        hasOne.forEach(function (key) {
            href = '/' + this.generateRoute(key, 'show', true, itemPath.slice(1).split('/')).join('/');
            methods = [];
            if (this.internals.resources[key].show) methods.push('get');
            if (this.internals.resources[key].update) methods.push('put');
            if (this.internals.resources[key].patch) methods.push('patch');
            if (this.internals.resources[key].destroy) methods.push('delete');
            hypermedia.item.items[Inflection.singularize(key)] = { href: href, methods: methods };
        }.bind(this));
    }

    if (hasMany.length) {
        hasMany = hasMany.filter(function (key) {
            return path.indexOf(key) === -1 && path.indexOf(Inflection.singularize(key)) === -1;
        });
        hasMany.forEach(function (key) {
            href = '/' + this.generateRoute(key, 'index', false, itemPath.slice(1).split('/')).join('/');
            methods = [];
            if (this.internals.resources[key].index) methods.push('get');
            if (this.internals.resources[key].create) methods.push('post');
            hypermedia.item.items[key] = { href: href, methods: methods };
        }.bind(this));
    }

    return hypermedia;
};

Mudskipper.prototype.generateRoute = function _generateRoute(name, method, singular, path) {
    var segments;

    if (path.length) {
        segments = [].concat(path);
    } else {
        if (this.internals.namespace && (!this.internals.resources[name].path || this.internals.resources[name].path[0] !== '/')) {
            segments = [this.internals.namespace];
        } else {
            segments = [];
        }
    }

    var nextSegment = '';

    if (singular) {
        nextSegment = Inflection.singularize(name);
    }

    if (this.internals.resources[name].path) {
        if (this.internals.resources[name].path[0] === '/') {
            if (method === 'index' || method === 'create') {
                return this.internals.resources[name].path.slice(1).split('/');
            } else {
                nextSegment = this.internals.resources[name].path.slice(1).split('/');
            }
        } else {
            nextSegment = this.internals.resources[name].path.split('/');
        }
        segments = segments.concat(nextSegment);
    } else {
        segments.push(nextSegment || name);
    }

    nextSegment = '';
    if (this.internals.uniqueIds === false) {
        if (path.length) {
            path.forEach(function (p) {
                if (p.charAt(0) === '{') {
                    nextSegment = 'sub_' + nextSegment;
                }
            });
        }
    } else {
        nextSegment = Inflection.singularize(name) + '_';
    }
    nextSegment = '{' + nextSegment + 'id}';

    if (method !== 'index' && method !== 'create' && !singular) {
        segments.push(nextSegment);
    }

    return segments;
};

Mudskipper.prototype.addChild = function _addChild(parent, path, child, singular) {
    var i, l, childName, settings, method, objectPath, route, hasOneKeys, hasManyKeys, hypermedia;

    function stripHandlers(obj) {
        var result = Hoek.clone(obj);
        for (var m in result) {
            if (result[m].handler) delete result[m].handler;
        }
        return result;
    }

    parent = stripHandlers(parent);

    for (i = 0, l = Object.keys(child).length; i < l; i++) {
        childName = Object.keys(child)[i];
        hasOneKeys = Object.keys(child[childName].hasOne);
        hasManyKeys = Object.keys(child[childName].hasMany);
        objectPath = this.generateRoute(childName, 'show', singular, path);
        hypermedia = this.generateHypermedia(childName, path, singular, parent);

        for (method in this.internals.resources[childName]) {
            if (!singular) {
                if (['index', 'create', 'show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;
            } else {
                if (['show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;
            }

            if (typeof this.internals.resources[childName][method] === 'function') this.internals.resources[childName][method] = { handler: this.internals.resources[childName][method] };
            settings = parent && parent[method] ? Hoek.merge(parent[method], this.internals.resources[childName][method]) : this.internals.resources[childName][method];
            if (settings.config && settings.config.validate && settings.config.validate.path) delete settings.config.validate.path;

            route = Hoek.applyToDefaults(this.internals.defaults[method], settings);

            route.path = '/' + this.generateRoute(childName, method, singular, path).join('/');
            if (method === 'index') {
                route.config.bind.hypermedia = hypermedia.collection;
            } else if (method === 'show') {
                route.config.bind.hypermedia = hypermedia.item;
            }
            delete route.itemLinks;
            delete route.collectionLinks;
            this.internals.routes.push(route);
        }

        if (hasOneKeys.length) this.addChild(settings, objectPath, child[childName].hasOne, true);
        if (hasManyKeys.length) this.addChild(settings, objectPath, child[childName].hasMany, false);
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
