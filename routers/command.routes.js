const express = require('express');
const {Mongoose} = require('mongoose');
const middlewares = require('../middlewares');
const router = express.Router();
const Channel = require('../models/channel.model');
const User = require('../models/user.model');
const commands = require('../config/command.config');

router.post("/command/send",
    [middlewares.auth.verifyToken],
    async (req, res) => {
        try {
            if (req.body.command) {
                let commandChosen = commands.commandes.filter(cmd => cmd.command === req.body.command.trim());
                console.log(req.body.command)
                console.log(commandChosen[0])
                if (commandChosen[0]) {
                    commandChosen[0].executeCommand(req).then((callback) => {
                        res.status(callback.code).send({message: callback.message, data: callback.data})
                    }).catch((err) => {
                            res.status(err.code).send({message: err.message})
                        }
                    )
                }
            }
        } catch (error) {
            console.log(error)
            res.status(400).send(error)
        }
    }
);

module.exports = router;
