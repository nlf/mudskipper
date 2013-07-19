##hapi-resourceful

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
server.pack.require('hapi-resourceful', resources, function (err) {
    if (err) console.error('failed to load resourceful routes:', err);
});
```

The above example would create routes for
```
GET /users
GET /users/user_id
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

Anything specified in the object will override any defaults that are set within the plugin.

Additionally, nested resources can be created by using the 'children' field
```javascript
var resources = {
    articles: {
        index: function (request) {
        }
    },
    users: {
        children: ['articles'],
        index: function (request) {
        }
    }
}
```

Children *must* be specified as an array. That array can contain either strings referring to a top level resource, or objects describing a new resource altogether.
```javascript
var resources = {
    tests: {
        index: function (request) {
        },
        children: [
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
* destroy
 - method: 'delete'
 - path: '/{name}/{name_id}

Note that 'name' is whatever key is found in the resources object (in the above examples, it would be 'users'). name_id will be that name, after an attempt to singularize, and the literal string '_id' appended to it (the above examples would yield user_id).
