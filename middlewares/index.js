const auth = require("./auth.middleware");
const signup = require("./signup.middleware");
const channel = require("./channel.middleware");

module.exports = {
    auth,
    signup,
    channel
};
