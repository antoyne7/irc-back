const jwt = require("jsonwebtoken");
const config = require('../config/auth.config');

const socketio = require("socket.io");
const Channel = require("../models/channel.model")
const User = require("../models/user.model")

const commands = require('../config/command.config');
const PeerServer = require("peer").PeerServer;

let users = [];
let rooms = [];

const fs = require('fs');

module.exports = function (server) {

    const io = socketio(server, {
        cors: {
            origin: ["https://irc-fron.vercel.app/", "http://localhost:3000", "https://localhost:3000"],
            methods: ["GET", "POST"]
        }
    });

//Run quand qqn se connecte
    io.on('connection', socket => {
        console.log('New WebSocket connection, ID is ' + socket.id);

        socket.on("join", (room, token) => {
            decodeToken(token).then((user) => {
                let userVerifier = users.filter(userSelect => userSelect.userId.toString() === user._id.toString() && user.room === userSelect.room)
                let roomVerifier = rooms.find(roomSelect => roomSelect.room === room)
                if (userVerifier.length <= 0) users.push({
                    id: socket.id,
                    username: user.username,
                    userId: user._id,
                    room
                });
                if (!roomVerifier || roomVerifier.length <= 0) rooms.push({room})
                socket.join(room);
                io.to(room).emit('userJoin', user.username + " a rejoint le chat", roomVerifier ? roomVerifier.isInCall : false);
            }).catch(err => {
                console.log(err)
            })
        });

        socket.on('chat', (message, room, token, date) => {
            decodeToken(token).then((user) => {
                console.log(message, user.username, " | room: " + room.name);
                findChannel(room).then((channel) => {
                    let nickname = channel.users.find(chanUser => chanUser._id.toString() === user._id.toString()).nickname;
                    if (message.length > 0) {
                        findChannel(room).then((channel) => {
                            channel.messages.push({message, user: user._id, date});
                            channel.save(err => {
                                if (err) {
                                    console.log(err)
                                }
                            })
                        }).catch(err => console.log(err));
                        io.to(room.name).emit('chatMessage', message, nickname ? {username: "~" + nickname} : user, date)
                    }
                })
            })
        });

        socket.on('command', (room, message, token, parameters) => {
            decodeToken(token).then((user) => {
                findChannel(room).then((channel) => {
                    let commandChosen = commands.socketCommands.filter(cmd => cmd.command === message.trim());
                    if (commandChosen[0]) {
                        commandChosen[0].executeCommand(users, user, channel, parameters, io, token).then((callback) => {
                            socket.emit('commandCallback', {message: callback.message, data: callback.data})
                        }).catch(err => console.log({message: err.message}))
                    }
                })
            })
        });


        socket.on('disconnect', () => {
            const userIndex = users.findIndex(user => user.id === socket.id);
            const userLeft = users[userIndex];
            if (userLeft) {
                users.splice(userIndex, 1);
            }
            if (userLeft) {
                io.to(userLeft.room).emit('userLeft', `${userLeft.username} a quitté le chat.`);
            }
            socket.disconnect();
        });

        socket.on('makingCall', (room, isVideo, token) => {
            decodeToken(token).then((userDetails) => {
                const roomIndex = findRoomIndex(room.name)
                let usersInChan = users.filter(user => user.room === room.name)
                if (usersInChan.length > 1) {
                    if (room.name && !rooms[roomIndex]?.isInCall) {
                        rooms[roomIndex].isInCall = true;
                        rooms[roomIndex] = {...rooms[roomIndex], usersInCall: [userDetails._id]}
                        socket.to(room.name).broadcast.emit("incomingCall", usersInChan, userDetails._id)
                        io.to(socket.id).emit("closeTiming", usersInChan)
                    } else {
                        const findUser = rooms[roomIndex].usersInCall?.find(userId => userId.toString() == userDetails._id.toString())
                        if (!findUser) {
                            const usersInCall = rooms[roomIndex].usersInCall ? [...rooms[roomIndex].usersInCall, userDetails._id] : [userDetails._id];
                            rooms[roomIndex] = {...rooms[roomIndex], usersInCall: usersInCall}
                            const usrId = findSocketId(userDetails._id)
                            io.to(usrId).emit("joinExistingCall", rooms[roomIndex].usersInCall)
                        }
                    }
                }
            })
        })
        socket.on("joinCall", (room, token) => {
            decodeToken(token).then((userDetails) => {
                io.to(room).emit("channelInCall")
                const roomIndex = findRoomIndex(room)
                    const findUser = rooms[roomIndex].usersInCall?.find(userId => userId.toString() == userDetails._id.toString())
                    if (!findUser) {
                        const usersInCall = rooms[roomIndex].usersInCall ? [...rooms[roomIndex].usersInCall, userDetails._id] : [userDetails._id];
                        rooms[roomIndex] = {...rooms[roomIndex], usersInCall: usersInCall}
                        const usrId = findSocketId(userDetails._id)
                        io.to(usrId).emit("joinExistingCall", rooms[roomIndex].usersInCall)
                    }
                }
            )
        })

        socket.on("sending signal", payload => {
            const usrId = findSocketId(payload.userToSignal)
            io.to(usrId).emit('user joined', {signal: payload.signal, callerID: payload.callerID});
        });

        socket.on("returning signal", payload => {
            const usrId = findSocketId(payload.callerID)
            io.to(usrId).emit('receiving returned signal', {
                signal: payload.signal,
                userId: payload.userId,
                id: socket.id
            });
        });

        socket.on('closeCallNotif', (users, room) => {
            const roomIndex = findRoomIndex(room)
            let usersInChan = users.filter(user => user.room === room)
            usersInChan.forEach((user) => {
                if (!rooms[roomIndex].usersInCall.find(usr => usr == user.userId)) io.to(user.id).emit('closeCall')
            })
            if (rooms[roomIndex]?.usersInCall?.length <= 1) {
                rooms[roomIndex].isInCall = false;
                rooms[roomIndex].usersInCall = [];
            }
        })
        socket.on('leavingCall', (room, token) => {
            decodeToken(token).then((userDetails) => {
                const roomIndex = findRoomIndex(room);
                if (rooms[roomIndex]?.isInCall) {
                    const usrIndex = rooms[roomIndex]?.usersInCall.findIndex(usr => usr.toString() == userDetails._id.toString());
                    if (rooms[roomIndex].usersInCall[usrIndex]) {
                        rooms[roomIndex].usersInCall.splice(usrIndex, 1)
                        rooms[roomIndex].usersInCall.forEach((usr) => {
                            const idToEmit = findSocketId(usr)
                            io.to(idToEmit).emit("disconectPeer", userDetails._id, room)
                            io.to(socket.id).emit("dc")
                        })
                    }
                }

                if (rooms[roomIndex]?.usersInCall?.length <= 1) {
                    rooms[roomIndex].usersInCall = []
                    rooms[roomIndex].isInCall = false;
                    io.to(room).emit("notInCall")
                }
            })
        })
    });


    const findSocketId = (userId) => {
        return users.find(user => user.userId.toString() == userId.toString()).id
    }

    const findRoomIndex = (room) => {
        return rooms.findIndex(roomDetail => roomDetail.room === room)
    }

    const decodeToken = async (token) => {
        return await findUser(await jwt.verify(token, config.secret, async (err, decoded) => {
            if (err) {
                throw err
            }
            return decoded._id;
        }))
    };

    const findUser = async (id) => {
        return await User.findById(id).select("picture channels username").exec();
    };

    const findChannel = async (room) => {
        return await Channel.findById(room._id).select("-password").exec()
    };
};
