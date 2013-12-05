##mudskipper

This is a resourceful routing plugin for Hapi. Given an object describing the available resources, a route will be created for each method defined on the resource. For example:

```javascript
var Hapi = require('hapi');

var resources = {
    users: {
        index: function (request) {
            request.reply(users.all());
        },
        show: function (request) {
            request.reply(users.one(request.params.user_id));
        }
    }
}

var server = new Hapi.Server();
server.pack.require('mudskipper', resources, function (err) {
    if (err) console.error('failed to load resourceful routes:', err);
});
```

The above example would create routes for
```
GET /users
GET /users/{user_id}
```

You'll notice that here, we only supplied functions for the methods. This causes the function to be used as the handler for the route, and defaults applied to the other values. Alternatively, methods can be defined as an object containing anything that's available as part of a route. For example:

```javascript
var resources = {
    users: {
        create: {
            handler: function (request) {
                request.reply(users.create(request.payload));
            },
            config: {
                payload: 'parse',
                validate: {
                    payload: {
                        username: Types.String().min(8).max(50)
                    }
                }
            }
        }
    }
}
```

Anything specified in the object will override any defaults that are set within the plugin. If a path is specified, it is *not* passed through directly. Some modification will be made by the plugin. For example
```javascript
articles: {
    index: {
        path: '/test'
    }
}
```
Would create the index route at the path ```/test```. If the articles resource were specified as a child of another resource, the path would be changed to ```/parent/{parent_id}/test```

If the path is specified without a leading /, such as
```javascript
articles: {
    index: {
        path: 'test'
    }
}
```
Then the index route would be added at the path ```/articles/test``` and the nested resource would become ```/parent/{parent_id}/articles/test```

Nested resources can be created by using the 'hasOne' or 'hasMany' fields. Circular dependencies are handled appropriately.
```javascript
var resources = {
    articles: {
        hasOne: 'users',
        index: function (request) {
        }
    },
    users: {
        hasMany: ['articles'],
        index: function (request) {
        }
    }
}
```

Children may be specified as a string, an object, or an array of any combination of those two. Strings must refer to a top level resource, and objects describe a new resource altogether.
```javascript
var resources = {
    tests: {
        index: function (request) {
        },
        hasMany: [
            {
                extras: {
                    index: function (request) {
                    }
                }
            }
        ]
    }
}
```

###Available methods and their defaults
* index
 - method: 'get'
 - path: '/{name}'
* show
 - method: 'get'
 - path: '/{name}/{name_id}
* create
 - method: 'post'
 - path: '/{name}'
 - payload: 'parse'
* update
 - method: 'put'
 - path: '/{name}/{name_id}
 - payload: 'parse'
* patch
 - method: 'patch'
 - path: '/{name}/{name_id}
 - payload: 'parse'
* destroy
 - method: 'delete'
 - path: '/{name}/{name_id}

Note that 'name' is whatever key is found in the resources object (in the above examples, it would be 'users'). name_id will be that name, after an attempt to singularize, and the literal string '_id' appended to it (the above examples would yield user_id).

Additionally, you can specify a top level option ```uniqueIds: false``` and ids will be created such as /name/{id}/subname/{sub_id} rather than attempting to singularize name and subname.
