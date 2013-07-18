var Hoek = require('hoek');

var internals = {};

internals.defaults = {};

exports.register = function _register(pack, options, next) {

    var settings = Hoek.applyToDefaults(internals.defaults, options);

    next();
};
