const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./user.model");


const ChannelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        maxlength: 16
    },
    slug: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: false,
    },
    isPrivate: {
        type: Boolean,
        default: false,
    },
    picture: {
        type: String,
        required: false,
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: false,
    },
    messages: [{
        message: {
            type: String,
            required: true,
        },
        date: {
            type: Date,
            required: true,
        },
        user:
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    }],
    users: [
        {
            _id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                unique: false,
                required: false,
            },
            nickname: {
                type: String,
            },
        }
    ]
});

ChannelSchema.pre("save", async function (next) {
    // Hash the password before saving the channel model
    const channel = this;
    if (channel.isModified("password") && channel.password) {
        channel.password = await bcrypt.hash(channel.password, 8)
    }
    next()
})

ChannelSchema.pre("deleteOne", async function (next) {
    const channelId = this.getFilter()["_id"];

    const users = await User.find({ channels: channelId}).exec()
    for(const user of users) {
        user.channels = user.channels.filter(chan => !chan.equals(channelId))
        await user.save()
    }

    next()
})

module.exports = mongoose.model("Channel", ChannelSchema);
