var Lab = require('lab');
var Hapi = require('hapi');
var Joi = require('joi');

// Declare internals
var internals = {};

// Test shortcuts
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var describe = Lab.experiment;
var it = Lab.test;

internals.namespace = 'api';
internals.resources = {
    root: {
        handler: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'root' }); },
        collectionLinks: { self: { href: '/notroot' }, random: { href: '/thing' } }
    },
    users: {
        itemLinks: {
            thing: { href: '/thing' }
        },
        collectionLinks: {
            articles: { href: '/api/articles' }
        },
        hasMany: ['articles', 'comments'],
        index: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'users index' }); },
        show: {
            handler: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'users show ' + (request.params.user_id || '5') }); },
            config: {
                validate: {
                    path: {
                        user_id: Joi.number()
                    }
                }
            }
        }
    },
    articles: {
        hasOne: 'users',
        hasMany: 'comments',
        index: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'articles index' }); },
        show: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'articles show ' + request.params.article_id }); },
        create: {
            handler: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'articles create ' + request.payload.title }).code(201); },
            config: {
                validate: {
                    payload: {
                        title: Joi.string()
                    }
                }
            }
        }
    },
    comments: {
        hasOne: ['users'],
        index: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'comments index' }); },
        destroy: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'comments destroy ' + request.params.comment_id }); }
    },
    bananas: {
        hasMany: {
            skins: {
                index: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'skins index' }); }
            }
        },
        path: '/banana',
        show: function (request, reply) { reply({ hypermedia: request.route.bind.hypermedia, reply: 'bananas show ' + request.params.banana_id }); }
    }
};

var internals_add = {
    resources: {
        tests: {
            index: function (request, reply) {
                reply('ok');
            }
        }
    }
};

var server, table;

describe('plugin', function () {
    it('can be added to hapi', function (done) {
        server = new Hapi.Server();
        server.pack.require('../', internals, function (err) {
            expect(err).to.not.exist;

            done();
        });
    });

    it('can add more routes after being loaded', function (done) {
        server.plugins.mudskipper.route(internals_add, function () {
            table = server.table();
            done();
        });
    });
});

describe('root', function () {
    var hypermedia;

    it('registered the additional route', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/tests');
        });

        expect(found).to.have.length(1);

        done();
    });

    it('registers a route', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/api');
        });

        expect(found).to.have.length(1);

        done();
    });

    it('responds to index', function (done) {
        server.inject({
            method: 'get',
            url: '/api'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('root');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has valid hypermedia', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'users', 'articles', 'comments', 'random', 'bananas');
        expect(hypermedia.links.self).to.deep.equal({ href: '/notroot' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api' });
        expect(hypermedia.links.users).to.deep.equal({ href: '/api/users' });
        expect(hypermedia.links.articles).to.deep.equal({ href: '/api/articles' });
        expect(hypermedia.links.comments).to.deep.equal({ href: '/api/comments' });
        expect(hypermedia.links.random).to.deep.equal({ href: '/thing' });
        expect(hypermedia.links.bananas).to.deep.equal({ href: '/banana' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });
});

describe('users', function () {
    var hypermedia;

    it('registers base routes', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/api/users') ||
                (route.method === 'get' && route.path === '/api/users/{user_id}');
        });

        expect(found).to.have.length(2);

        done();
    });

    it('registers nested routes', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/api/articles/{article_id}/user') ||
                (route.method === 'get' && route.path === '/api/articles/{article_id}/comments/{comment_id}/user') ||
                (route.method === 'get' && route.path === '/api/comments/{comment_id}/user');
        });

        expect(found).to.have.length(3);

        done();
    });

    it('responds to index', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('users index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item', 'articles');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/users' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/users/{user_id}' });
        expect(hypermedia.links.articles).to.deep.equal({ href: '/api/articles' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to show', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('users show 5');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct show hypermedia', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'thing');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/users/{user_id}' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/users' });
        expect(hypermedia.links.thing).to.deep.equal({ href: '/thing' });

        expect(hypermedia.items).to.be.an('object');
        expect(hypermedia.items).to.have.keys('articles', 'comments');
        expect(hypermedia.items.articles).to.deep.equal({ href: '/api/users/{user_id}/articles', methods: ['get', 'post'] });
        expect(hypermedia.items.comments).to.deep.equal({ href: '/api/users/{user_id}/comments', methods: ['get'] });

        done();
    });

    it('responds to show nested on articles', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5/user'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('users show 5');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct show hypermedia while nested on articles', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.have.keys('self', 'up', 'thing');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/articles/{article_id}/user' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/articles/{article_id}' });
        expect(hypermedia.links.thing).to.deep.equal({ href: '/thing' });

        expect(hypermedia.items).to.have.key('comments');
        expect(hypermedia.items.comments).to.deep.equal({ href: '/api/articles/{article_id}/user/comments', methods: ['get'] });

        done();
    });

    it('responds to show nested on comments', function (done) {
        server.inject({
            method: 'get',
            url: '/api/comments/5/user'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('users show 5');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct show hypermedia while nested on comments', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.have.keys('self', 'up', 'thing');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/comments/{comment_id}/user' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/comments/{comment_id}' });
        expect(hypermedia.links.thing).to.deep.equal({ href: '/thing' });

        expect(hypermedia.items).to.have.key('articles');
        expect(hypermedia.items.articles).to.deep.equal({ href: '/api/comments/{comment_id}/user/articles', methods: ['get', 'post'] });

        done();
    });
});

describe('articles', function () {
    var hypermedia;

    it('registers base routes', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/api/articles') ||
                (route.method === 'get' && route.path === '/api/articles/{article_id}') ||
                (route.method === 'post' && route.path === '/api/articles');
        });

        expect(found).to.have.length(3);

        done();
    });

    it('registers nested routes', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/api/users/{user_id}/articles') ||
                (route.method === 'get' && route.path === '/api/users/{user_id}/articles/{article_id}') ||
                (route.method === 'post' && route.path === '/api/users/{user_id}/articles') ||
                (route.method === 'get' && route.path === '/api/comments/{comment_id}/user/articles') ||
                (route.method === 'get' && route.path === '/api/comments/{comment_id}/user/articles/{article_id}') ||
                (route.method === 'post' && route.path === '/api/comments/{comment_id}/user/articles');
        });

        expect(found).to.have.length(6);

        done();
    });

    it('responds to index', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get', 'post']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/articles' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/articles/{article_id}' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to show', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles show 5');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct show hypermedia', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/articles/{article_id}' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/articles' });

        expect(hypermedia.items).to.be.an('object');
        expect(hypermedia.items).to.have.keys('user', 'comments');
        expect(hypermedia.items.user).to.deep.equal({ href: '/api/articles/{article_id}/user', methods: ['get'] });
        expect(hypermedia.items.comments).to.deep.equal({ href: '/api/articles/{article_id}/comments', methods: ['get'] });

        done();
    });

    it('responds to create', function (done) {
        server.inject({
            method: 'post',
            url: '/api/articles',
            payload: { title: 'test' }
        }, function (res) {
            expect(res.statusCode).to.equal(201);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles create test');
            expect(res.result.hypermedia).to.be.empty;

            done();
        });
    });

    it('responds to index nested on users', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users/5/articles'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia when nested on users', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get', 'post']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/users/{user_id}/articles' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/users/{user_id}' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/users/{user_id}/articles/{article_id}' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to index nested on user nested on comments', function (done) {
        server.inject({
            method: 'get',
            url: '/api/comments/5/user/articles'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia when nested on user nested on comments', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get', 'post']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/comments/{comment_id}/user/articles' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/comments/{comment_id}/user' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/comments/{comment_id}/user/articles/{article_id}' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to show nested on users', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users/5/articles/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles show 5');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct show hypermedia when nested on users', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/users/{user_id}/articles/{article_id}' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/users/{user_id}/articles' });

        expect(hypermedia.items).to.be.an('object');
        expect(hypermedia.items).to.have.keys('comments');
        expect(hypermedia.items.comments).to.deep.equal({ href: '/api/users/{user_id}/articles/{article_id}/comments', methods: ['get'] });

        done();
    });

    it('responds to show nested on user nested on comments', function (done) {
        server.inject({
            method: 'get',
            url: '/api/comments/5/user/articles/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles show 5');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct show hypermedia when nested on user nested on comments', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/comments/{comment_id}/user/articles/{article_id}' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/comments/{comment_id}/user/articles' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to create nested on users', function (done) {
        server.inject({
            method: 'post',
            url: '/api/users/5/articles',
            payload: { title: 'test' }
        }, function (res) {
            expect(res.statusCode).to.equal(201);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles create test');
            expect(res.result.hypermedia).to.be.empty;

            done();
        });
    });

    it('responds to create nested on user nested on comments', function (done) {
        server.inject({
            method: 'post',
            url: '/api/comments/5/user/articles',
            payload: { title: 'test' }
        }, function (res) {
            expect(res.statusCode).to.equal(201);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('articles create test');
            expect(res.result.hypermedia).to.be.empty;

            done();
        });
    });
});

describe('comments', function () {
    var hypermedia;

    it('registers base routes', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/api/comments') ||
                (route.method === 'delete' && route.path === '/api/comments/{comment_id}');
        });

        expect(found).to.have.length(2);

        done();
    });

    it('registers nested routes', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/api/users/{user_id}/comments') ||
                (route.method === 'delete' && route.path === '/api/users/{user_id}/comments/{comment_id}') ||
                (route.method === 'get' && route.path === '/api/articles/{article_id}/comments') ||
                (route.method === 'delete' && route.path === '/api/articles/{article_id}/comments/{comment_id}') ||
                (route.method === 'get' && route.path === '/api/articles/{article_id}/user/comments') ||
                (route.method === 'delete' && route.path === '/api/articles/{article_id}/user/comments/{comment_id}');
        });

        expect(found).to.have.length(6);

        done();
    });

    it('responds to index', function (done) {
        server.inject({
            method: 'get',
            url: '/api/comments'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct hypermedia for index', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/comments' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/comments/{comment_id}' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to destroy', function (done) {
        server.inject({
            method: 'delete',
            url: '/api/comments/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments destroy 5');
            expect(res.result.hypermedia).to.be.empty;

            done();
        });
    });

    it('responds to index nested on users', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users/5/comments'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia when nested on users', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/users/{user_id}/comments' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/users/{user_id}' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/users/{user_id}/comments/{comment_id}' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to index nested on articles', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5/comments'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia when nested on articles', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/articles/{article_id}/comments' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/articles/{article_id}' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/articles/{article_id}/comments/{comment_id}' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to index nested on user nested on articles', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5/user/comments'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia when nested on user nested on articles', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up', 'item');
        expect(hypermedia.links.self).to.deep.equal({ href: '/api/articles/{article_id}/user/comments' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api/articles/{article_id}/user' });
        expect(hypermedia.links.item).to.deep.equal({ href: '/api/articles/{article_id}/user/comments/{comment_id}' });

        expect(hypermedia.items).to.deep.equal({});

        done();
    });

    it('responds to destroy nested on users', function (done) {
        server.inject({
            method: 'delete',
            url: '/api/users/5/comments/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments destroy 5');
            expect(res.result.hypermedia).to.be.empty;

            done();
        });
    });

    it('responds to destroy nested on articles', function (done) {
        server.inject({
            method: 'delete',
            url: '/api/articles/5/comments/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments destroy 5');
            expect(res.result.hypermedia).to.be.empty;

            done();
        });
    });

    it('responds to destroy nested on user nested on articles', function (done) {
        server.inject({
            method: 'delete',
            url: '/api/articles/5/user/comments/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('comments destroy 5');
            expect(res.result.hypermedia).to.be.empty;

            done();
        });
    });
});

describe('bananas', function () {
    var hypermedia;

    it('registers base route', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/banana/{banana_id}');
        });

        expect(found).to.have.length(1);

        done();
    });

    it('responds to show', function (done) {
        server.inject({
            method: 'get',
            url: '/banana/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('bananas show 5');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct show hypermedia', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up');
        expect(hypermedia.links.self).to.deep.equal({ href: '/banana/{banana_id}' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/api' });

        expect(hypermedia.items).to.be.an('object');
        expect(hypermedia.items).to.have.key('skins');
        expect(hypermedia.items.skins).to.deep.equal({ href: '/banana/{banana_id}/skins', methods: ['get'] });

        done();
    });
});

describe('skins', function () {
    var hypermedia;

    it('registers the route', function (done) {
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/banana/{banana_id}/skins');
        });

        expect(found).to.have.length(1);

        done();
    });

    it('responds to index', function (done) {
        server.inject({
            method: 'get',
            url: '/banana/5/skins'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply', 'hypermedia');
            expect(res.result.reply).to.deep.equal('skins index');
            expect(res.result.hypermedia).to.be.an('object');
            hypermedia = res.result.hypermedia;

            done();
        });
    });

    it('has correct index hypermedia', function (done) {
        expect(hypermedia).to.have.keys('methods', 'links', 'items');

        expect(hypermedia.methods).to.deep.equal(['get']);

        expect(hypermedia.links).to.be.an('object');
        expect(hypermedia.links).to.have.keys('self', 'up');
        expect(hypermedia.links.self).to.deep.equal({ href: '/banana/{banana_id}/skins' });
        expect(hypermedia.links.up).to.deep.equal({ href: '/banana/{banana_id}' });

        expect(hypermedia.items).to.deep.equal({});
        done();
    });
});
