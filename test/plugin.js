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

    it('registers routes', function (done) {

        var articleindex = false;
        var articleshow = false;
        var articlecreate = false;

        var userindex = false;
        var usercreate = false;

        var userarticleindex = false;
        var userarticleshow = false;
        var userarticlecreate = false;

        var table = server.routingTable();
        table.forEach(function (route) {
            if (route.method === 'get' && route.path === '/articles') {
                articleindex = true;
            } else if (route.method === 'get' && route.path === '/articles/{article_id}') {
                articleshow = true;
            } else if (route.method === 'post' && route.path === '/articles') {
                articlecreate = true;
            } else if (route.method === 'get' && route.path === '/users') {
                userindex = true;
            } else if (route.method === 'post' && route.path === '/users') {
                usercreate = true;
            } else if (route.method === 'get' && route.path === '/users/{user_id}/articles') {
                userarticleindex = true;
            } else if (route.method === 'get' && route.path === '/users/{user_id}/articles/{article_id}') {
                userarticleshow = true;
            } else if (route.method === 'post' && route.path === '/users/{user_id}/articles') {
                userarticlecreate = true;
            }
        });

        expect(articleindex).to.equal(true);
        expect(articleshow).to.equal(true);
        expect(articlecreate).to.equal(true);

        expect(userindex).to.equal(true);
        expect(usercreate).to.equal(true);

        expect(userarticleindex).to.equal(true);
        expect(userarticleshow).to.equal(true);
        expect(userarticlecreate).to.equal(true);

        done();
    });
});
