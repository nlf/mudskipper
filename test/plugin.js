var Lab = require('lab');
var Hapi = require('hapi');

// Declare internals
var internals = {};

internals.resources = {
    articles: {
        index: function (request) {
            request.reply([]);
        },
        show: function (request) {
            request.reply([]);
        },
        create: {
            handler: function (request) {
                request.reply('ok');
            }
        }
    },
    users: {
        children: ['articles'],
        index: function (request) {
            request.reply([]);
        },
        create: {
            handler: function (request) {
                request.reply('ok');
            },
            config: {
                payload: 'parse'
            }
        }
    }
}

// Test shortcuts
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var describe = Lab.experiment;
var it = Lab.test;

var server;

describe('hapi-resourceful', function () {
    it('can be added as a plugin to hapi', function (done) {

        server = new Hapi.Server();
        server.pack.require('../', internals.resources, function (err) {

            expect(err).to.not.exist;
            done();
        });
    });

    it('registers routes for articles', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/articles')
            || (route.method === 'get' && route.path === '/articles/{article_id}')
            || (route.method == 'post' && route.path === '/articles');
        });

        expect(found.length).to.equal(3);

        done();
    });

    it('registers routes for users', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/users')
            || (route.method === 'post' && route.path === '/users');
        });

        expect(found.length).to.equal(2);

        done();
    });

    it('registers routes for articles nested on users', function (done) {

        var table = server.routingTable();
        var found = table.filter(function (route) {
            return (route.method === 'get' && route.path === '/users/{user_id}/articles')
            || (route.method === 'get' && route.path === '/users/{user_id}/articles/{article_id}')
            || (route.method === 'post' && route.path === '/users/{user_id}/articles');
        });

        expect(found.length).to.equal(3);

        done();
    });
});
