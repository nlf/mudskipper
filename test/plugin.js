exports.version = '1.0.0';

exports.name = 'tests';

exports.register = function (plugin, options, next) {
    plugin.dependency('mudskipper');

    var resources = {
        tests: {
            index: function (request) {
                request.reply('ok');
            }
        }
    };

    console.log(require('util').inspect(plugin.select(), false, null, true));
    //plugin.plugins.mudskipper.addResource(resources);
    next();
};
