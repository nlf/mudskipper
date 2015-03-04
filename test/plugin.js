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
        handler: function (request, reply) { reply({ reply: 'root' }); }
    },
    users: {
        hasMany: ['articles', 'comments'],
        index: function (request, reply) { reply({ reply: 'users index' }); },
        show: {
            handler: function (request, reply) { reply({ reply: 'users show ' + (request.params.user_id || '5') }); },
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
        index: function (request, reply) { reply({ reply: 'articles index' }); },
        show: function (request, reply) { reply({ reply: 'articles show ' + request.params.article_id }); },
        create: {
            handler: function (request, reply) { reply({ reply: 'articles create ' + request.payload.title }).code(201); },
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
        index: function (request, reply) { reply({ reply: 'comments index' }); },
        destroy: function (request, reply) { reply({ reply: 'comments destroy ' + request.params.comment_id }); }
    },
    bananas: {
        hasMany: {
            skins: {
                index: function (request, reply) { reply({ reply: 'skins index' }); }
            }
        },
        path: '/banana',
        show: function (request, reply) { reply({ reply: 'bananas show ' + request.params.banana_id }); }
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
            expect(res.result.reply).to.deep.equal('root');

            done();
        });
    });

});

describe('users', function () {

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('users index');

            done();
        });
    });

    it('responds to show', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('users show 5');

            done();
        });
    });

    it('responds to show nested on articles', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5/user'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('users show 5');

            done();
        });
    });

    it('responds to show nested on comments', function (done) {
        server.inject({
            method: 'get',
            url: '/api/comments/5/user'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('users show 5');

            done();
        });
    });
});

describe('articles', function () {

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles index');

            done();
        });
    });

    it('responds to show', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles show 5');

            done();
        });
    });

    it('responds to create', function (done) {
        server.inject({
            method: 'post',
            url: '/api/articles',
            payload: { title: 'test' }
        }, function (res) {
            expect(res.statusCode).to.equal(201);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles create test');

            done();
        });
    });

    it('responds to index nested on users', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users/5/articles'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles index');

            done();
        });
    });

    it('responds to index nested on user nested on comments', function (done) {
        server.inject({
            method: 'get',
            url: '/api/comments/5/user/articles'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles index');

            done();
        });
    });

    it('responds to show nested on users', function (done) {
        server.inject({
            method: 'get',
            url: '/api/users/5/articles/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles show 5');

            done();
        });
    });

    it('responds to show nested on user nested on comments', function (done) {
        server.inject({
            method: 'get',
            url: '/api/comments/5/user/articles/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles show 5');

            done();
        });
    });

    it('responds to create nested on users', function (done) {
        server.inject({
            method: 'post',
            url: '/api/users/5/articles',
            payload: { title: 'test' }
        }, function (res) {
            expect(res.statusCode).to.equal(201);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles create test');

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('articles create test');

            done();
        });
    });
});

describe('comments', function () {

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments index');

            done();
        });
    });

    it('responds to destroy', function (done) {
        server.inject({
            method: 'delete',
            url: '/api/comments/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments destroy 5');

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments index');

            done();
        });
    });

    it('responds to index nested on articles', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5/comments'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments index');

            done();
        });
    });

    it('responds to index nested on user nested on articles', function (done) {
        server.inject({
            method: 'get',
            url: '/api/articles/5/user/comments'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments index');

            done();
        });
    });

    it('responds to destroy nested on users', function (done) {
        server.inject({
            method: 'delete',
            url: '/api/users/5/comments/5'
        }, function (res) {
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.be.an('object');
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments destroy 5');

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments destroy 5');

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('comments destroy 5');

            done();
        });
    });
});

describe('bananas', function () {

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('bananas show 5');

            done();
        });
    });
});

describe('skins', function () {

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
            expect(res.result).to.have.keys('reply');
            expect(res.result.reply).to.deep.equal('skins index');

            done();
        });
    });
});
