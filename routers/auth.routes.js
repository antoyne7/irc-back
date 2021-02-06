const express = require('express')
const User = require('../models/user.model')
const Role = require('../models/role.model')
const middlewares = require('../middlewares')
const Channel = require('../models/channel.model');

const jwt = require("jsonwebtoken")
const config = require("../config/auth.config")

const router = express.Router()

router.post('/auth/signup', [
    middlewares.signup.checkRolesExisted,
    middlewares.signup.checkDuplicateUsernameOrEmail
], async (req, res) => {
    // Register a new user
    try {
        const user = new User(req.body);

        if (req.body.password.length < 7) {
            res.status(400).send({message: "Le mot de passe doit faire plus de 7 caractères", type: "form_error"})
            return;
        }
        if (req.body.password !== req.body.passwordRepeat) {
            res.status(400).send({message: "Les mots de passes ne correspondent pas", type: "form_error"})
            return;
        } else {
            await Role.find({
                    name: {$in: req.body.roles}
                }, (err, roles) => {
                    if (err) {
                        res.status(500).send({message: err});
                        return;
                    }
                    user.roles = roles.map(role => role._id);
                }
            );

            const channelGlobal = await Channel.findOne({slug: "global"}).select('id users').exec();

            await user.save(err => {
                if (err) {
                    res.status(400).send({err});
                } else {
                    user.channels.push(channelGlobal._id);
                    channelGlobal.users.push(user._id);
                    user.save();
                    channelGlobal.save();
                    res.send({message: "L'inscription est validée", type: "form_error"});
                }
            })
        }
    } catch (error) {
        // res.status(400).send( error)
        console.log(error)
    }
})

router.post('/auth/signin',
    async (req, res) => {
        // Login a registered user
        try {
            console.log("Le zgegon")
            if (!req.body.firstCredential || !req.body.password) {
                res.status(401).send({
                    message: "Veuillez remplir vos informations",
                    type: "form_error"
                })
                return
            }
            const {firstCredential, password} = req.body;
            const user = await User.findByCredentials(firstCredential, password);
            if (!user._id) {
                res.status(401).send({
                    message: "Votre mot de passe ou votre identifiant est incorrect",
                    type: "form_error"
                })
                return
            }

            //TODO: peut être changer l'emplacement de ce script
            //Quand la personne se connecte, on vérifie que les salons existent encore
            for (const chanId of user.channels) {
                const chan = await Channel.findById(chanId);
                if (!chan) {
                    user.channels.splice(user.channels.indexOf(chanId), 1)
                }
            }
            await user.save((err) => {
                if (err) console.log(err)
            });

            const token = await user.generateAuthToken();
            res.send({
                user: {
                    username: user.username,
                    picture: user.picture,
                    roles: user.roles,
                    whiteTheme: user.whiteTheme
                }, token
            })
        } catch (error) {
            res.status(400).send(error)
        }
    });

router.post('/auth/guest_login',
    [
        middlewares.signup.checkRolesExisted,
        middlewares.signup.checkDuplicateUsername
    ],
    async (req, res) => {
        try {
            if (!req.body.username){
                res.status(401).send({
                    message: "Veuillez remplir vos informations",
                    type: "form_error"
                })
                return;
            }
            const {username} = req.body;

            //Generate random password
            const password = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

            const user = new User({username, usr_identifier: username.toLowerCase(), password});

            await Role.find({
                    name: "guest"
                }, (err, roles) => {
                    if (err) {
                        return res.status(500).send({message: err});
                    }
                    user.roles = roles.map(role => role._id);
                }
            );

            //Ajout de l'utilisateur au channel global
            const channelGlobal = await Channel.findOne({slug: "global"}).select('id users').exec();

            await user.save(err => {
                if (err) {
                    return res.status(500).send({err, type: "form_error"});
                } else {
                    const token = jwt.sign({_id: user._id}, config.secret)
                    user.channels.push(channelGlobal._id);
                    channelGlobal.users.push(user._id);

                    user.save();
                    channelGlobal.save();
                    res.send({user: {username: user.username, roles: user.roles}, token})
                }
            });


        } catch (e) {
            return res.status(400).send({message: e})
        }
    }
);
router.post('/auth/delete',
    [middlewares.auth.verifyToken],
    async (req, res) => {
        try {
            const id = await decodeToken(req.headers["x-access-token"])
            let username = await generateUsername();

            //Suppression des channels auxquels est relié l'utilisateur
            const channels = await User.findById(id).select("channels").exec();
            if (channels.channels) {
                for (let chann of channels.channels) {
                    const channelFound = await Channel.findById(chann._id).select("users").exec();
                    if (channelFound) {
                        console.log(channelFound.users.indexOf(id));
                        channelFound.users.splice(channelFound.users.indexOf(id), 1);
                        await channelFound.save((err) => {
                            if (err) {
                                res.status(500).send({message: err});
                            }
                        })
                    }
                }
            }

            await User.findByIdAndUpdate(id, {
                username: username,
                usr_identifier: username.toLowerCase(),
                $unset: {email: ""},
                picture: null,
                password: null,
                channels: []
            }, {}, (err) => {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                }
            });
            res.status(200).send({message: "Votre compte a bien été supprimé"})
        } catch (e) {
            console.log(e);
            res.status(500).send(e);
        }
    }
);

// Check user authenticated, return user w/o password
router.get('/auth/check',
    [middlewares.auth.verifyToken],
    async (req, res) => {
        const user = req.connectedUser;
        user.password = "";

        await user.populate({ path: 'channels', populate: { path: 'users', populate: {path: '_id'} }}).execPopulate()

        res.status(200).send(user);
    });

const generateUsername = async () => {
    let usrname = config.anonymous_usrname + Math.floor(1000 + Math.random() * 9000);
    const userTest = await User.findOne({name: usrname}).exec();
    if (userTest) {
        return await generateUsername();
    } else {
        return usrname;
    }
};

const decodeToken = async (token) => {
    return await jwt.verify(token, config.secret, async (err, decoded) => {
        if (err) {
            throw err
        }
        return decoded._id;
    });
};

module.exports = router
