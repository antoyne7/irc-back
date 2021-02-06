const mongoose = require('mongoose');

const db = {};

db.mongoose = mongoose;

db.user = require("./user.model");
db.role = require("./role.model");
db.channel = require("./channel.model");
db.ROLES = ["user"];

module.exports = db;
