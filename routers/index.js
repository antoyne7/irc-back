const authRoutes = require("./auth.routes");
const commandRoutes = require("./command.routes")
const channelRoutes = require("./channel.routes")
const userRoutes = require("./user.routes")

const express = require("express");
const router = express.Router();

module.exports = function (app) {
    // Header
    router.use(function (req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // Les routes
    router.use(authRoutes);
    router.use(commandRoutes);
    router.use(channelRoutes);
    router.use(userRoutes);

    // Base path
    app.use('/api', router)
};
