const express = require('express');
const middlewares = require('../middlewares')
const router = express.Router();
const Channel = require('../models/channel.model');
const User = require('../models/user.model');
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require('fs')

// Multer file storage
const storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, 'uploads/channels-pictures')
    },
    filename: (req, file, callback) => {
        callback(null, Date.now() + '-' + slugify(file.originalname) + "." + file.mimetype.split("/")[1])
    }
})
const upload = multer({storage})

router.post("/channel/add", [
        middlewares.channel.checkDuplicatedName,
        middlewares.channel.checkInvalidCharacter,
        middlewares.auth.verifyToken
    ],
    async (req, res) => {
        try {
            if (req.body.name.length <= 3) {
                res.status(400).send({message: "Veuillez renseigner un nom de channel de plus de 3 caractères"})
                return
            }
            const channel = new Channel({
                name: req.body.name.trim(),
                slug: slugify(req.body.slug.trim()),
                password: req.body.password.length > 0 ? req.body.password : null,
                creator: req.connectedUser._id,
            });
            if (req.body.password && req.body.password !== req.body.passwordRepeat) {
                if (req.body.password.length < 4) {
                    res.status(400).send({message: 'Le mot de passe doit faire au moins 4 caractères'})
                    return
                }
                res.status(400).send({message: 'Les mots de passe ne correspondent pas'})
                return
            }

            await req.connectedUser.save()
            await channel.save()

            req.connectedUser.channels.push(channel._id)
            channel.users.push(req.connectedUser._id)

            await req.connectedUser.save()
            await channel.save()

            res.send({message: "Le channel a bien été ajouté", channel: channel.name, slug: channel.slug});
            return;
        } catch (e) {
            console.log(e)
            res.status(400).send(e)
        }
    });

router.get("/channel/delete",
    [middlewares.auth.verifyToken],
    async (req, res) => {
        try {
            console.log(req.query.channel)
            const channel = await Channel.findOne({slug: req.query.channel}).exec();
            if (!channel) {
                res.status(404).send({message: "Aucun salon trouvé..."});
                return
            }

            if (channel.creator != req.userId) {
                res.status(403).send({message: "Vous n'êtes pas le propiétaire du salon"});
                return
            }

            if (channel.isPrivate) {
                res.status(403).send({message: "Impossible de supprimer votre conversation privé"});
                return
            }

            await Channel.deleteOne({_id: channel._id})

            res.status(200).send({message: "Le salon a bien été supprimé."})
        } catch (e) {
            res.status(500).send({message: "Une erreur s'est produite"})
        }
    });
router.post("/channel/leave",
    [middlewares.auth.verifyToken],
    async (req, res) => {
        try {
            const channel = await Channel.findById(req.body.channel).exec();
            if (!channel) {
                res.status(400).send({message: "Le salon n'a pas été trouvé"})
                return
            }
            if (channel.slug === 'global') {
                res.status(403).send({message: "Impossible de quitter le salon global"})
                return
            }

            if (!req.connectedUser.channels.includes(channel._id)) {
                res.status(403).send({message: "Vous ne faites pas partie de ce salon"})
                return
            }

            if (channel.isPrivate) {
                const user1 = await User.findById(channel.users[0]._id)
                const user2 = await User.findById(channel.users[1]._id)

                user1.channels = user1.channels.filter(chanID => chanID.toString() !== channel._id.toString())
                user2.channels = user2.channels.filter(chanID => chanID.toString() !== channel._id.toString())

                await channel.deleteOne()
                await user1.save();
                await user2.save();

                res.status(200).send({message: `Les messages privés de ce salon ont été supprimés.`})
                return
            }

            const userChanIndex = req.connectedUser.channels.indexOf(channel._id);
            const chanIndex = channel.users.indexOf(req.connectedUser._id);

            req.connectedUser.channels.splice(userChanIndex, 1);
            channel.users.splice(chanIndex, 1);


            await req.connectedUser.save();
            await channel.save();
            res.status(200).send({message: `Vous avez quitté ${channel.name} avec succès !`})
        } catch (err) {
            res.status(400).send({message: err})
        }
    }
)

router.get("/channel/get",
    [middlewares.auth.verifyToken],
    async (req, res) => {
        try {
            let channel;
            //TODO: Faire avec $or ?
            channel = await Channel.findOne({slug: req.query.channel}).select('-password').exec()
            if (!channel) { // recherche par ID également
                channel = await Channel.find({_id: req.query.channel}).select('-password').exec()
                if (channel[0]) {
                    channel = channel[0]
                }
            }
            // console.log(channel)
            if (!channel) {
                res.status(404).send({message: "Aucun salon trouvé..."})
                return
            }
            const user = await User.findById(req.connectedUser._id).select('id channels');

            if (!user) {
                res.status(404).send({message: "L'utilisateur n'a pas été trouvé"})
            }
            const isInChannel = user.channels.find(chan => chan._id.toString() == channel._id.toString())

            if (!isInChannel) {
                res.status(403).send({message: "Vous ne faites pas partis du salon"})
                return
            }
            const isUserInChannel = channel.users.find(utilisateur => utilisateur._id.toString() == user._id.toString())

            if (!isUserInChannel) {
                console.log('ca a planter lol !')
                res.status(403).send({message: "Vous ne faites pas partis du salon"})
                return
            }

            if (channel.isPrivate) {
                await channel.populate({path: 'users', populate: {path: '_id'}}).execPopulate();
            }

            res.status(200).send({channel})
        } catch (error) {
            res.status(400).send({message: error})
        }
    });

router.get("/channel/search",
    [middlewares.auth.verifyToken],
    async (req, res) => {
        if (req.query.search.length >= 3) {
            new Promise((resolve, reject) => {
                Channel.find(
                    {
                        $or: [{slug: {$regex: req.query.search, $ne: 'global'}}, {name: {$regex: req.query.search}}],
                        isPrivate: false,
                    },
                    (err, chanlist) => {
                        if (err) {
                            console.log(err);
                            return
                        }
                        let max = parseInt(req.query.maxresp);
                        if (max && !isNaN(max) && chanlist.length > max) {
                            chanlist.length = max
                        }
                        resolve(chanlist);
                        reject(err)
                    }).select('-password');
            }).then((response) => {
                return res.send(response)
            }).catch((err) => {
                console.log(err)
            })
        }
    });

router.post("/channel/connect", [middlewares.auth.verifyToken],
    async (req, res) => {
        try {
            const channel = await Channel.findOne({slug: req.body.slug}).exec()
            if (!channel) {
                res.status(500).send({message: "Le salon n'a pas été trouvé..."})
                return
            }
            if (req.connectedUser.channels.includes(channel._id) && channel.users.find(user => user._id == req.userId)) {
                res.status(200).send({message: "Vous faites déjà partie de ce salon"});
                return
            }

            // TODO: Si channel mot de passe -> bcrypt.compareSync(req.body.password, channel.password)
            if (channel.password) {
                if (req.body.password) {
                    if (bcrypt.compareSync(req.body.password, channel.password)) {
                        req.connectedUser.channels.push(channel._id)
                        channel.users.push(req.connectedUser._id)
                        // console.log(req.connectedUser);
                        await channel.save();
                        await req.connectedUser.save();
                        res.status(200).send({message: "Connecté à ce salon avec succès!", slug: channel.slug})
                        return
                    } else {
                        res.status(403).send({message: "Le mot de passe est incorrect"})
                        return
                    }
                } else {
                    res.status(200).send({message: "Rentrez le mot de passe", slug: channel.slug, password: true})
                    return
                }
            } else {
                req.connectedUser.channels.push(channel._id);
                channel.users.push(req.connectedUser._id);
                await req.connectedUser.save();
                await channel.save();
                res.status(200).send({message: "Connecté à ce salon avec succès!"})
            }
        } catch (e) {
            console.log(e);
            res.status(400).send(e)

        }

    });

router.get("/channel/messages/get", [middlewares.auth.verifyToken],
    async (req, res) => {
        try {
            const channel = await Channel.findById(req.query.channel);
            const maxRequest = 35;
            const reqIteration = req.query.reqiteration ?? 0;
            const addmsg = req.query.addmsg ?? 0;
            if (!channel) {
                res.status(500).send({message: "Le salon n'a pas été trouvé..."})
                return
            }

            channel.messages.reverse();
            let messagesTemp = []
            for (let i = 0; i < maxRequest; i++) {
                if (channel.messages[(maxRequest * reqIteration) + i + parseInt(addmsg)]) {
                    messagesTemp.push(channel.messages[(maxRequest * reqIteration) + i + parseInt(addmsg)])
                }
            }

            if (maxRequest && !isNaN(maxRequest) && messagesTemp.length > maxRequest) {
                messagesTemp.length = maxRequest;
            }
            let messages;
            if (reqIteration === 0) {
                messages = messagesTemp.reverse();
            } else {
                messages = messagesTemp
            }
            const msgArray = [];
            for (const msg of messages) {
                await findUser(msg.user).then((userDetails) => {

                    let tempnickname = channel.users.find(chanUser => chanUser._id == req.userId)?.nickname;
                    let userNickname;
                    if (msg.user._id == req.userId) {
                        userNickname = tempnickname
                    }
                    const msgDetails = {
                        _id: msg._id,
                        message: msg.message,
                        date: msg.date,
                        user: {
                            _id: userDetails._id,
                            username: userNickname ? "~" + userNickname : userDetails.username,
                            picture: userDetails.picture
                        }
                    };
                    msgArray.push(msgDetails);
                    userNickname = null;
                })
            }

            res.status(200).send(msgArray)
        } catch
            (e) {
            console.log(e)
            res.status(400).send(e)
        }
    }
);

router.post("/channel/settings", [middlewares.auth.verifyToken, upload.single('picture')],
    async (req, res) => {
        // Check user bien admin du channel
        const channel = await Channel.findOne({_id: req.body.channelId}).catch(err => console.log(err))

        if (!channel) {
            res.status(404).send({message: "Le salon n'a pas été trouvé, vérifiez qu'il existe encore"})
            return
        }

        if (!channel.creator.equals(req.connectedUser._id)) {
            res.status(401).send({message: "Non autorisé, vous n'êtes pas le créateur du salon"})
            return
        }

        if (typeof req.file !== "undefined") {
            const oldPicturePath =
                __dirname + '/../uploads/channels-pictures/' + channel.picture
            if (fs.existsSync(oldPicturePath)) {
                fs.unlinkSync(oldPicturePath)
            }
            channel.picture = req.file.filename
        }
        channel.name = req.body.name
        channel.slug = slugify(req.body.name)

        if (req.body.password.length > 0) {
            if (req.body.password !== req.body.passwordRepeat) {
                res.status(400).send({message: "Les mots de passe ne correspondent pas."});
                return;
            }

            if (channel.password?.length > 0 &&
                !bcrypt.compareSync(req.body.oldPassword, channel.password)) {
                res.status(400).send({message: "Le mot de passe du salon est incorrect."});
                return;
            }

            channel.password = req.body.password
        }

        await channel.save()
        res.status(201).send({message: "Modifications réussies", channel})
    });

const findUser = async (user) => {
    return User.findById(user).select('username picture');
};

const slugify = (string) => {
    const a = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/,:;'
    const b = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------'
    const p = new RegExp(a.split('').join('|'), 'g')

    return string.toString().toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
        .replace(/&/g, '-and-') // Replace & with 'and'
        .replace(/[^\w\-]+/g, '') // Remove all non-word characters
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, '') // Trim - from end of text
};


module.exports = router;
