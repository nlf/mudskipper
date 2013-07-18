var Lab = require('lab');
var Hapi = require('hapi');

// Declare internals
var internals = {};

internals.resources = {
    test: {
        index: function (request) {
            console.log('getting an index');
            request.reply([]);
        },
        show: function (request) {
            console.log('showing a test object');
            request.reply([]);
        },
        create: {
            handler: function (request) {
                console.log('creating an object');
                request.reply('ok');
            }
        }
    },
    deeptest: {
        children: ['test'],
        index: function (request) {
            console.log('deeptest index');
            request.reply([]);
        },
        create: {
            handler: function (request) {
                console.log('creating deeptest object');
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

        var testindex = false;
        var testshow = false;
        var testcreate = false;
        var deeptestindex = false;
        var deeptestcreate = false;

        var table = server.routingTable();
        table.forEach(function (route) {
            if (route.method === 'get' && route.path === '/test') {
                testindex = true;
            } else if (route.method === 'get' && route.path === '/test/{test_id}') {
                testshow = true;
            } else if (route.method === 'post' && route.path === '/test') {
                testcreate = true;
            } else if (route.method === 'get' && route.path === '/deeptest') {
                deeptestindex = true;
            } else if (route.method === 'post' && route.path === '/deeptest') {
                deeptestcreate = true;
            }
        });

        expect(testindex).to.equal(true);
        expect(testshow).to.equal(true);
        expect(testcreate).to.equal(true);
        expect(deeptestindex).to.equal(true);
        expect(deeptestcreate).to.equal(true);

        done();
    });
});
