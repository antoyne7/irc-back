const dotenv = require('dotenv').config();

module.exports = {
    CONNECT_STRING: process.env.mongo_uri
};
