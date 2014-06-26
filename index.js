var Hoek = require('hoek');
var Inflection = require('inflection');

// Defaults for the methods
var internals = {
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

// a helper function to recurse through all the resources
// and save their dependencies so we can find children later
function saveDependencies(name, obj) {
    var child, childName;
    internals.dependencies[name] = { hasOne: [], hasMany: [] };

    function _parse(prop) {
        if (!Array.isArray(obj[prop])) obj[prop] = [obj[prop]];
        for (var i = 0, l = obj[prop].length; i < l; i++) {
            child = obj[prop][i];
            if (typeof child !== 'string') {
                Hoek.assert(Object.keys(child).length === 1, 'Child object must contain only one property');

                childName = Object.keys(child)[0];
                internals.dependencies[name][prop].push(childName);
                internals.resources[childName] = child[childName];
                internals.resources[childName].childOnly = true;
                saveDependencies(childName, child[childName]);
                delete internals.resources[childName].hasOne;
                delete internals.resources[childName].hasMany;
            } else {
                internals.dependencies[name][prop].push(obj[prop][i]);
            }
        }
    }

    if (obj.hasOne) _parse('hasOne');
    if (obj.hasMany) _parse('hasMany');
}

// the first pass goes through all keys, and makes sure that the hasOne
// and hasMany properties are arrays of strings. if objects are found,
// they are copied to internals.resources with the childOnly flag set
// to true, so as to prevent a top level route being created for them.
// all other objects are copied to internals.resources with the hasOne
// and hasMany keys removed.
function firstPass() {
    var key, resource, child, childName, i, l;

    for (key in internals.options) {
        resource = internals.options[key];
        internals.dependencies[key] = {};
        saveDependencies(key, resource);
        internals.resources[key] = resource;
        delete internals.resources[key].hasOne;
        delete internals.resources[key].hasMany;
    }

    secondPass();
}

// the second pass generates routes for all resources that
// have top level routes (i.e. the childOnly flag is *not* set)
// additionally, it ensures that methods for all resources are
// an object containing a handler property set to a function
function secondPass() {
    var key, resource, method, settings, objectPath, children, hasOneKeys, hasManyKeys, hypermedia;

    for (key in internals.resources) {
        resource = internals.resources[key];
        hypermedia = generateHypermedia(key, [], false);

        if (key === 'root') {
            if (typeof resource === 'function') resource = { handler: resource };
            settings = Hoek.applyToDefaults(internals.defaults.index, resource);
            settings.path = '/' + (internals.namespace ? internals.namespace : '');
            settings.config.bind.hypermedia = hypermedia.collection;
            delete settings.collectionLinks;
            delete settings.itemLinks;
            internals.routes.push(settings);
            continue;
        }

        if (resource.childOnly) continue;
        children = findChildren(key);
        hasOneKeys = Object.keys(children.hasOne);
        hasManyKeys = Object.keys(children.hasMany);
        objectPath = generateRoute(key, 'show', false, []);

        for (method in resource) {
            if (['index', 'create', 'show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;

            if (typeof resource[method] === 'function') resource[method] = { handler: resource[method] };

            settings = Hoek.applyToDefaults(internals.defaults[method], resource[method]);
            if (settings.config && settings.config.validate && settings.config.validate.path) delete settings.config.validate.path;
            settings.path = '/' + generateRoute(key, method, false, []).join('/');
            if (method === 'index') {
                settings.config.bind.hypermedia = hypermedia.collection;
            } else if (method === 'show') {
                settings.config.bind.hypermedia = hypermedia.item;
            }
            delete settings.itemLinks;
            delete settings.collectionLinks;
            internals.routes.push(settings);
        }

        if (hasOneKeys.length) {
            addChild(resource, objectPath, children.hasOne, true);
        }

        if (hasManyKeys.length) {
            addChild(resource, objectPath, children.hasMany, false);
        }
    }

    internals.servers.route(internals.routes);

    // reset internals
    internals.hypermedia = {};
    internals.routes = [];
    internals.resources = {};
    internals.dependencies = {};
    internals.options = {};
    internals.namespace = '';
}

// a helper function to recursively find children from a given parent
function findChildren(parent, children, parents) {
    children = children || { hasOne: {}, hasMany: {} };
    parents = parents || [parent];
    if (!children.hasOne[parent] && !children.hasMany[parent]) children.hasOne[parent] = { hasOne: {}, hasMany: {} };
    var deps = internals.dependencies[parent];
    var child;

    function addChildren(prop) {
        for (var i = 0, l = deps[prop].length; i < l; i++) {
            if (parents.indexOf(deps[prop][i]) !== -1) continue;
            children[prop][deps[prop][i]] = findChildren(deps[prop][i], children[prop][parent], parents.concat([deps[prop][i]]));
        }
    }

    if (deps) {
        if (deps.hasOne) addChildren('hasOne');
        if (deps.hasMany) addChildren('hasMany');
    }

    delete children.hasOne[parent];

    return children;
}

function generateHypermedia(name, path, singular, parent) {
    var resource = internals.resources[name];
    var hypermedia = {};
    var newpath;

    if (name === 'root') {
        if (internals.namespace) {
            newpath = '/' + internals.namespace;
        } else {
            newpath = '/';
        }

        hypermedia.collection = {
            methods: ['get'],
            links: { self: { href: newpath }, up: { href: newpath } },
            items: {}
        };

        Object.keys(internals.resources).forEach(function (key) {
            if (internals.resources[key].childOnly || key === 'root') return;
            if (internals.resources[key].path) {
                newpath = internals.resources[key].path;
                if (internals.resources[key].path[0] === '/') {
                    hypermedia.collection.links[key] = { href: newpath };
                } else {
                    if (internals.namespace) {
                        newpath = '/' + internals.namespace + '/' + newpath;
                    }
                    hypermedia.collection.links[key] = { href: newpath };
                }
            } else {
                newpath = '/' + key;
                if (internals.namespace) {
                    newpath = '/' + internals.namespace + newpath;
                }
                hypermedia.collection.links[key] = { href: newpath };
            }
        });
        if (resource.collectionLinks) hypermedia.collection.links = Hoek.merge(hypermedia.collection.links, resource.collectionLinks);
        return hypermedia;
    }

    var hasOne = internals.dependencies[name].hasOne;
    var hasMany = internals.dependencies[name].hasMany;
    var rootPath = '/' + generateRoute(name, 'index', singular, path).join('/');
    var itemPath = '/' + generateRoute(name, 'show', singular, path).join('/');
    var href, methods, upPath, singularParent;

    if (!parent) {
        if (internals.namespace) {
            upPath = '/' + internals.namespace;
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
            href = '/' + generateRoute(key, 'show', true, itemPath.slice(1).split('/')).join('/');
            methods = [];
            if (internals.resources[key].show) methods.push('get');
            if (internals.resources[key].update) methods.push('put');
            if (internals.resources[key].patch) methods.push('patch');
            if (internals.resources[key].destroy) methods.push('delete');
            hypermedia.item.items[Inflection.singularize(key)] = { href: href, methods: methods };
        });
    }

    if (hasMany.length) {
        hasMany = hasMany.filter(function (key) {
            return path.indexOf(key) === -1 && path.indexOf(Inflection.singularize(key)) === -1;
        });
        hasMany.forEach(function (key) {
            href = '/' + generateRoute(key, 'index', false, itemPath.slice(1).split('/')).join('/');
            methods = [];
            if (internals.resources[key].index) methods.push('get');
            if (internals.resources[key].create) methods.push('post');
            hypermedia.item.items[key] = { href: href, methods: methods };
        });
    }

    return hypermedia;
}

function generateRoute(name, method, singular, path) {
    var segments;

    if (path.length) {
        segments = [].concat(path);
    } else {
        if (internals.namespace && (!internals.resources[name].path || internals.resources[name].path[0] !== '/')) {
            segments = [internals.namespace];
        } else {
            segments = [];
        }
    }

    var nextSegment = '';

    if (singular) {
        nextSegment = Inflection.singularize(name);
    }

    if (internals.resources[name].path) {
        if (internals.resources[name].path[0] === '/') {
            if (method === 'index' || method === 'create') {
                return internals.resources[name].path.slice(1).split('/');
            } else {
                nextSegment = internals.resources[name].path.slice(1).split('/');
            }
        } else {
            nextSegment = internals.resources[name].path.split('/');
        }
        segments = segments.concat(nextSegment);
    } else {
        segments.push(nextSegment || name);
    }

    nextSegment = '';
    if (internals.uniqueIds === false) {
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
}

function addChild(parent, path, child, singular) {
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
        objectPath = generateRoute(childName, 'show', singular, path);
        hypermedia = generateHypermedia(childName, path, singular, parent);

        for (method in internals.resources[childName]) {
            if (!singular) {
                if (['index', 'create', 'show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;
            } else {
                if (['show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;
            }

            if (typeof internals.resources[childName][method] === 'function') internals.resources[childName][method] = { handler: internals.resources[childName][method] };
            settings = parent && parent[method] ? Hoek.merge(parent[method], internals.resources[childName][method]) : internals.resources[childName][method];
            if (settings.config && settings.config.validate && settings.config.validate.path) delete settings.config.validate.path;

            route = Hoek.applyToDefaults(internals.defaults[method], settings);

            route.path = '/' + generateRoute(childName, method, singular, path).join('/');
            if (method === 'index') {
                route.config.bind.hypermedia = hypermedia.collection;
            } else if (method === 'show') {
                route.config.bind.hypermedia = hypermedia.item;
            }
            delete route.itemLinks;
            delete route.collectionLinks;
            internals.routes.push(route);
        }

        if (hasOneKeys.length) addChild(settings, objectPath, child[childName].hasOne, true);
        if (hasManyKeys.length) addChild(settings, objectPath, child[childName].hasMany, false);
    }
}

function buildRoutes(options, next) {
    Hoek.assert(typeof options === 'object', 'Options must be defined as an object');
    Hoek.assert(options.hasOwnProperty('namespace') ? typeof options.namespace === 'string' : true, 'Namespace must be a string');
    Hoek.assert(options.hasOwnProperty('labels') ? Array.isArray(options.labels) : true, 'Labels must be an array');

    internals.servers = options.labels ? internals.plugin.select(options.labels) : internals.plugin;

    internals.options = options.resources;
    internals.uniqueIds = options.hasOwnProperty('uniqueIds') ? options.uniqueIds : true;
    internals.namespace = options.hasOwnProperty('namespace') ? options.namespace : '';
    if (internals.options && Object.keys(internals.options).length) {
        firstPass();
    }
    next();
}

exports.register = function (plugin, options, next) {
    internals.plugin = plugin;
    options.resources = options.resources || {};
    plugin.expose({ route: buildRoutes });
    buildRoutes(options, next);
};

exports.register.attributes = {
    pkg: require('./package.json');
};
