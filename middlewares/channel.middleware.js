const db = require("../models");
const Channel = db.channel;


checkDuplicatedName = (req, res, next) => {
    Channel.findOne({
        name: req.body.name
    }).exec((err, user) => {
        if (err) {
            res.status(500).send({message: err});
            return;
        }

        if (user) {
            res.status(400).send({message: "Ce nom de salon est déjà pris"});
            return;
        }
        next();
    })
};
checkInvalidCharacter = (req, res, next) => {
    let cityreg=/^[^*?¤$%@!^¨µ£°=+}{'"~&/-]+$/;
    if (!req.body.name.match(cityreg)){
        res.status(403).send({message: "Le nom du salon est invalide"});
        return;
    }
    next()

}
const verifySignUp = {
    checkDuplicatedName,
    checkInvalidCharacter
};
module.exports = verifySignUp;
