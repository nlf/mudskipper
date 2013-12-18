var Lab = require('lab');
var Hapi = require('hapi');
var Types = Hapi.types;

// Declare internals
var internals = {};

// Test shortcuts
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var describe = Lab.experiment;
var it = Lab.test;

internals.resources = {
    root: {
        handler: function (request) { request.reply([]); },
        collectionLinks: { self: { href: '/notroot' }, random: { href: '/thing' } }
    },
    articles: {
        itemLinks: {
            random: { href: '/thing' }
        },
        collectionLinks: {
            self: { href: '/notusers' }
        },
        hasOne: 'users',
        index: function (request) {
            request.reply([]);
        },
        show: {
            handler: function (request) {
                request.reply([]);
            },
            config: {
                validate: {
                    path: {
                        article_id: Types.String()
                    }
                }
            }
        },
        create: {
            handler: function (request) {
                request.reply('ok');
            }
        }
    },
    articlesFail: {
        create: {
            handler: function (request) {
                request.reply('not ok').code(500);
            }
        }
    },
    users: {
        hasMany: ['articles', 'articlesFail'],
        index: function (request) {
            request.reply([]);
        },
        show: {
            handler: function (request) {
                request.reply('ok');
            },
            config: {
                validate: {
                    path: {
                        user_id: Types.String()
                    }
                }
            }
        },
        create: {
            handler: function (request) {
                expect(request.payload).to.deep.equal({ name: 'test' });
                request.reply('ok');
            },
            config: {
                payload: 'parse'
            }
        }
    },
    tests: {
        index: function (request) {
            request.reply([]);
        },
        hasMany: [
            {
                extras: {
                    hasOne: 'bananas',
                    index: function (request) {
                        request.reply([]);
                    }
                }
            }
        ]
    },
    bananas: {
        hasMany: 'articles',
        index: function (request) {
            request.reply([]);
        }
    }
};


var server;

describe('mudskipper', function () {
    it('can be added as a plugin to hapi', function (done) {

        server = new Hapi.Server();
        server.pack.require('../', internals, function (err) {

            expect(err).to.not.exist;
            done();
        });
    });

    it('registers routes for articles', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/articles') ||
                (route.method === 'get' && route.path === '/articles/{article_id}') ||
                (route.method === 'post' && route.path === '/articles');
        });

        expect(found.length).to.equal(3);

        done();
    });

    it('registers routes for users', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/users') ||
                (route.method === 'post' && route.path === '/users');
        });

        expect(found.length).to.equal(2);

        done();
    });

    it('registers routes for articles nested on users', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/users/{user_id}/articles') ||
                (route.method === 'get' && route.path === '/users/{user_id}/articles/{article_id}') ||
                (route.method === 'post' && route.path === '/users/{user_id}/articles');
        });

        expect(found.length).to.equal(3);

        done();
    });

    it('does not lose validation for nested routes', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/users/{user_id}/articles/{article_id}');
        });

        expect(found[0].settings).to.have.property('validate');
        expect(found[0].settings.validate).to.have.property('path');
        expect(found[0].settings.validate.path).to.have.property('article_id');
        expect(found[0].settings.validate.path).to.have.property('user_id');

        done();
    });

    it('registers routes for tests', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/tests');
        });

        expect(found.length).to.equal(1);

        done();
    });

    it('registers routes for extras nested on tests', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/tests/{test_id}/extras');
        });

        expect(found.length).to.equal(1);

        done();
    });

    it('allows a POST to get properly parsed', function (done) {

        server.inject({ method: 'POST', url: '/users', payload: '{ "name": "test" }' }, function (res) {

            expect(res.result).to.equal('ok');
            expect(res.statusCode).to.equal(200);

            done();
        });

    });

    it('a "hasMany" nested resource should have a "hasOne" reference to parent resource', function (done) {

        server.inject({ method: 'POST', url: '/users/foo/articlesFail', payload: '{}' }, function (res) {

            expect(res.result).to.equal('not ok');
            expect(res.statusCode).to.equal(500);

            done();
        });

    });
});
