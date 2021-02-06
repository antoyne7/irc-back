const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    secret: process.env.jwt_secret,
    anonymous_usrname: "Anonyme"
}
