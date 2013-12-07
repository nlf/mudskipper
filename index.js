var Hoek = require('hoek');
var Inflection = require('inflection');

// Defaults for the methods
var internals = {
    hypermedia: {},
    routes: [],
    resources: {},
    dependencies: {},
    options: {},
    defaults: {
        index: {
            method: 'get',
            config: {
                context: {}
            }
        },
        show: {
            method: 'get',
            config: {
                context: {}
            }
        },
        create: {
            method: 'post',
            config: {
                payload: 'parse',
                context: {}
            }
        },
        update: {
            method: 'put',
            config: {
                payload: 'parse',
                context: {}
            }
        },
        patch: {
            method: 'patch',
            config: {
                payload: 'parse',
                context: {}
            }
        },
        destroy: {
            method: 'delete',
            config: {
                context: {}
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
        if (key === 'uniqueIds') continue;
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
            settings.path = '/';
            settings.config.context.hypermedia = hypermedia.collection;
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
            settings.path = '/' + generateRoute(key, method, false, []).join('/');
            if (method === 'index' || method === 'create') {
                settings.config.context.hypermedia = hypermedia.collection;
            } else {
                settings.config.context.hypermedia = hypermedia.item;
            }
            internals.routes.push(settings);
        }

        if (hasOneKeys.length) {
            addChild(resource, objectPath, children.hasOne, true);
        }

        if (hasManyKeys.length) {
            addChild(resource, objectPath, children.hasMany, false);
        }
    }

    internals.plugin.route(internals.routes);
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
            parents.push(deps[prop][i]);
            children[prop][deps[prop][i]] = findChildren(deps[prop][i], children[prop][parent], parents);
        }
    }

    if (deps) {
        if (deps.hasOne) addChildren('hasOne');
        if (deps.hasMany) addChildren('hasMany');
    }

    delete children.hasOne[parent];

    return children;
}

function generateHypermedia(name, path, singular) {
    var hypermedia = {};
    if (name === 'root') {
        hypermedia.collection = {
            links: [],
            items: []
        };
        Object.keys(internals.resources).forEach(function (key) {
            if (internals.resources[key].childOnly || key === 'root') return;
            hypermedia.collection.links.push({ name: key, href: '/' + key });
        });
        return hypermedia;
    }

    var hasOne = internals.dependencies[name].hasOne;
    var hasMany = internals.dependencies[name].hasMany;
    var rootPath = '/' + generateRoute(name, 'index', singular, path).join('/');
    var itemPath = '/' + generateRoute(name, 'show', singular, path).join('/');
    var upPath = path ? '/' + path.join('/') : '/';
    var childPath;

    if (!singular) {
        hypermedia.collection = {
            links: [],
            items: []
        };
        hypermedia.collection.links.push({ name: 'self', href: rootPath });
        hypermedia.collection.links.push({ name: 'up', href: upPath });
        hypermedia.collection.links.push({ name: 'item', href: itemPath });
    }

    hypermedia.item = {
        links: [],
        items: []
    };
    hypermedia.item.links.push({ name: 'self', href: singular ? rootPath : itemPath });
    hypermedia.item.links.push({ name: 'up', href: singular ? upPath : rootPath });
    if (hasOne.length) {
        hasOne = hasOne.filter(function (key) {
            return path.indexOf(key) === -1 && path.indexOf(Inflection.singularize(key)) === -1;
        });
        hasOne.forEach(function (key) {
            childPath = '/' + generateRoute(key, 'show', true, itemPath.slice(1).split('/')).join('/');
            hypermedia.item.items.push({ name: Inflection.singularize(key), href: childPath });
        });
    }

    if (hasMany.length) {
        hasMany = hasMany.filter(function (key) {
            return path.indexOf(key) === -1 && path.indexOf(Inflection.singularize(key)) === -1;
        });
        hasMany.forEach(function (key) {
            childPath = '/' + generateRoute(key, 'index', false, itemPath.slice(1).split('/')).join('/');
            hypermedia.item.items.push({ name: key, href: childPath });
        });
    }

    return hypermedia;
}

function generateRoute(name, method, singular, path) {
    var segments = [].concat(path);
    var nextSegment = '';

    if (singular) {
        nextSegment = Inflection.singularize(name);
    }

    if (internals.resources[name].path) {
        if (internals.resources[name].charAt(0) === '/') {
            return internals.resources[name].path.slice(1).split('/');
        } else {
            nextSegment = internals.resources[name].path;
        }
    }

    segments.push(nextSegment || name);

    nextSegment = '';
    if (internals.resources[name].uniqueIds === false) {
        if (path.length) {
            path.forEach(function (p) {
                if (p.charAt(0) === '{') {
                    nextSegment = 'sub_' + nextSegment;
                }
            });
        } else {
            nextSegment = 'id';
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

    for (i = 0, l = Object.keys(child).length; i < l; i++) {
        childName = Object.keys(child)[i];
        hasOneKeys = Object.keys(child[childName].hasOne);
        hasManyKeys = Object.keys(child[childName].hasMany);
        settings = Hoek.merge(internals.resources[childName], parent);
        objectPath = generateRoute(childName, 'show', singular, path);
        hypermedia = generateHypermedia(childName, path, singular);

        for (method in internals.resources[childName]) {
            if (!singular) {
                if (['index', 'create', 'show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;
            } else {
                if (['show', 'update', 'patch', 'destroy'].indexOf(method) === -1) continue;
            }

            if (typeof internals.resources[childName][method] === 'function') internals.resources[childName][method] = { handler: internals.resources[childName][method] };

            route = Hoek.applyToDefaults(internals.defaults[method], settings[method]);

            route.path = '/' + generateRoute(childName, method, singular, path).join('/');
            if (method === 'index' || method === 'create') {
                route.config.context.hypermedia = hypermedia.collection;
            } else {
                route.config.context.hypermedia = hypermedia.item;
            }
            internals.routes.push(route);
        }

        if (hasOneKeys.length) addChild(settings, objectPath, child[childName].hasOne, true);
        if (hasManyKeys.length) addChild(settings, objectPath, child[childName].hasMany, false);
    }
}

exports.register = function _register(plugin, options, next) {
    Hoek.assert(typeof options === 'object', 'Options must be defined as an object');
    Hoek.assert(Object.keys(options).length > 0, 'Options must contain at least one key');

    internals.plugin = plugin;
    internals.options = options;
    if (!internals.options.hasOwnProperty('uniqueIds')) internals.options.uniqueIds = true;
    firstPass();
    next();
};
