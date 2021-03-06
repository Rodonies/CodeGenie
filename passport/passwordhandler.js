var bCrypt = require('bcrypt-nodejs');

var isValidPassword = function (user, password) {
    return bCrypt.compareSync(password, user.password);
};

var createHash = function (password) {
    return bCrypt.hashSync(password, bCrypt.genSaltSync(10), null);
};

exports.isValidPassword = isValidPassword;
exports.createHash = createHash;