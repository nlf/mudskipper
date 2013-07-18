var Hoek = require('hoek');

var internals = {};

exports.register = function _register(pack, options, next) {

    var settings = Hoek.applyToDefaults(internals, options);

    next();
};
