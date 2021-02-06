const express = require('express');
const {Mongoose} = require('mongoose');
const middlewares = require('../middlewares');
const router = express.Router();
const Channel = require('../models/channel.model');
const User = require('../models/user.model');
const commands = require('../config/command.config');


module.exports = {
    socketCommands: [
        {
            command: "listuser",
            executeCommand: async (users, user, channel, socket, token) => {
                const usersFiltered = users.filter(userFilter => userFilter.room == channel.name);
                // return {message: usersFiltered, action: "listuser"}
                return {
                    message: "Liste des utilisateurs",
                    code: 200,
                    data: {users: usersFiltered, action: "listuser"}
                }
            }
        },
        {
            command: "list",
            executeCommand: async (users, user, channel, parameters, socket, token) => {
                const channels = await Channel.find({isPrivate: false}).select("name");
                if (parameters[1]) {
                    const filteredChan = channels.filter((chan) => chan.name.includes(parameters[1]))
                    return {
                        message: "Liste des salons",
                        code: 200,
                        data: {channels: filteredChan, action: "list"}
                    }
                } else {
                    return {
                        message: "Liste des salons",
                        code: 200,
                        data: {channels: channels, action: "list"}
                    }
                }
            }
        },
        {
            command: "msg",
            executeCommand: async (users, user, channel, parameters, socket, token) => {
                const sender = user;

                const receiver = await User
                    .findOne({usr_identifier: parameters[1].toLowerCase()})
                    .select('id channels')
                if (!receiver) {
                    return {message: "Utilisateur introuvable", code: 400}
                }

                let privateChannel = await Channel.findOne({
                    users: [{_id: sender._id}, {_id: receiver._id}],
                    isPrivate: true
                })

                if (!privateChannel) {
                    privateChannel = new Channel({
                        name: '%'+ Date.now() +'%',
                        slug: Date.now(),
                        password: null,
                        creator: sender._id,
                        isPrivate: true
                    })
                    try {
                        await privateChannel.save()

                        privateChannel.users.push(sender._id)
                        privateChannel.users.push(receiver._id)

                        receiver.channels.push(privateChannel._id)
                        sender.channels.push(privateChannel._id)

                        await privateChannel.save()
                        await receiver.save()
                        await sender.save()
                    } catch (e) {
                        console.log(e)
                    }
                }

                // Envoyer le message
                let nickname = privateChannel.users.find(chanUser => chanUser._id.toString() === user._id.toString()).nickname;
                let message = ''
                if (parameters[2]) {
                    message = parameters.join(' ').replace(parameters[0] + ' ' + parameters[1] + ' ', '')
                }
                if (message.length > 0) {
                    privateChannel.messages.push({message: message, user: user._id, date: Date.now()});
                    privateChannel.save(err => {
                        if (err) {
                            console.log(err)
                        }
                    })
                    socket.to(privateChannel.name).emit('chatMessage', message, nickname ? {username: "~" + nickname} : user, Date.now())
                }
                return {
                    message: "Message envoyé",
                    code: 200,
                    data: {channel: privateChannel.slug, action: "join"}
                }
            }
        },
    ],
    commandes: [
        {
            command: "nick",
            executeCommand: async (req) => {
                let channel = await Channel.findById(req.body.channel).exec();
                if (!channel) {
                    throw {message: "Le salon n'a pas été trouvé", code: 400, data: null}
                }
                if (req.body.parameter && req.body.parameter.length > 0) {
                    channel.users.find(chanUser => chanUser._id == req.userId).nickname = req.body.parameter;
                } else {
                    channel.users.find(chanUser => chanUser._id == req.userId).nickname = null;
                }
                (await channel).save(err => {
                    if (err) {
                        console.log("encore");
                        throw {message: "Le salon n'a pas été trouvé", code: 400}
                    }

                });
                return {message: "Le surnom a bien été changé", code: 200}
            }
        },

        {
            command: "create",
            executeCommand: async (req) => {
                const channel = new Channel({
                    name: req.body.parameter,
                    slug: slugify(req.body.parameter),
                });
                channel.creator = req.userId;

                const findChan = await Channel.findOne({name: req.body.parameter});

                if (findChan) {
                    return {message: "Une erreur est survenue lors de la création.", code: 400}
                }
                req.connectedUser.channels.push(channel._id);
                channel.users.push(req.connectedUser._id);

                await req.connectedUser.save();

                await channel.save(err => {
                    if (err) {
                        console.log({message: "Une erreur est survenue lors de la création.", code: 400})
                    }
                });

                return {
                    message: "Le channel a bien été crée.",
                    code: 200,
                    data: {channel: channel.slug, action: "create"}
                }

            }
        },
        {
            command: "delete",
            executeCommand: async (req) => {
                const channel = await Channel.findOne({
                    $or: [{slug: req.body.parameter}, {name: req.body.parameter}],
                    isPrivate: false
                }).exec();
                if (!channel) {
                    return {message: "Le salon n'a pas été trouvé", code: 400}
                }
                if (channel.creator != req.userId) {
                    return {
                        message: "Vous n'êtes pas propiétaire du salon",
                        code: 403,
                    }
                }

                return {
                    message: "Voulez-vous vraiment supprimer ce salon ?",
                    code: 200,
                    data: {channel: channel.slug, action: "delete"}
                }
            }
        },
        {
            command: "join",
            executeCommand: async (req) => {
                const channel = await Channel.findOne({
                    $or: [{slug: req.body.parameter}, {name: req.body.parameter}],
                    isPrivate: false
                }).exec();
                if (!channel) {
                    return {message: "Le salon n'a pas été trouvé", code: 400}
                }
                if (req.connectedUser.channels.includes(channel._id)) {
                    return {
                        message: "Vous allez rejoindre le salon",
                        code: 200,
                        data: {channel: channel.slug, action: "join"}
                    }
                } else {
                    if (channel.password) {
                        return {
                            message: "Rentrez le mot de passe",
                            code: 200,
                            data: {channel: channel.slug, action: "join_password"}
                        }
                    } else {
                        req.connectedUser.channels.push(channel._id);
                        channel.users.push(req.connectedUser._id);
                    }
                }

                await req.connectedUser.save();
                await channel.save();


                return {
                    message: "Connecté au salon avec succès !",
                    code: 200,
                    data: {channel: channel.slug, action: "join"}
                }
            }
        },
        {
            command: "diablox9",
            executeCommand: async (req) => {
                return {
                    message: "Ouah vous êtes un pur gamer",
                    code: 200,
                    data: {video: "gZ0GRzpjxR8", action: "diablox9"}
                }
            }
        },
        {
            command: "quit",
            executeCommand: async (req) => {
                const channel = await Channel.findOne({
                    $or: [{slug: req.body.parameter}, {name: req.body.parameter}],
                    isPrivate: false
                }).exec();
                if (!channel) {
                    return {message: "Le salon n'a pas été trouvé", code: 400}
                }
                if (channel.slug === 'global') {
                    return {message: "Impossible de quitter le salon global", code: 401}
                }

                if (!req.connectedUser.channels.includes(channel._id)) {
                    return {message: "Vous ne faites pas partie de ce salon", code: 400}
                }
                const userChanIndex = req.connectedUser.channels.indexOf(channel._id);
                const chanIndex = channel.users.indexOf(req.connectedUser._id);

                req.connectedUser.channels.splice(userChanIndex, 1);
                channel.users.splice(chanIndex, 1);

                await req.connectedUser.save();
                await channel.save();

                return {
                    message: `Vous avez quitté ${channel.name} avec succès !`,
                    code: 200,
                    data: {
                        message: `Vous avez quitté ${channel.name} avec succès !`,
                        channel: channel.slug,
                        action: "quit"
                    }
                }
            }
        },
    ]
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
