const mongoose = require("mongoose");
const validator = require("validator")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const config = require("../config/auth.config")

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },

    usr_identifier: {
        type: String,
        unique: true,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: false,
        trim: true,
        sparse: true,
        unique: true,
        lowercase: true,
        validate: (value) => {
            if (!validator.isEmail(value)) {
                throw new Error({error: "L'addresse mail saisie est invalide"})
            }
        }
    },
    password: {
        type: String,
        required: true,
        minLength: 7
    },
    whiteTheme: {
        type: Boolean,
        required: false,
        default: false
    },
    channels: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Channel"
        }
    ],
    picture: {
        type: String,
        required: false,
        trim: true,
        unique: false
    },
    roles: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role"
        }
    ]
})

UserSchema.pre("save", async function (next) {
    // Hash the password before saving the user model
    const user = this
    if (user.isModified("password")) {
        user.password = await bcrypt.hash(user.password, 8)
    }
    next()
})

UserSchema.statics.findByCredentials = async (firstCredential, password) => {
    // Search for a user by email and password.
    const regex = new RegExp(['^', firstCredential, '$'].join(''), 'i')
    const user = await User.findOne({
        $or: [
            {usr_identifier: {'$regex': regex}},
            {email: {'$regex': regex}}
        ]
    }).exec()
    if (!user) {
        return {message: 'Votre mot de passe ou votre identifiant est incorrect'}
    }
    const isPasswordMatch = await bcrypt.compare(password, user.password)
    if (!isPasswordMatch) {
        return  {message: 'Votre mot de passe ou votre identifiant est incorrect'}
    }
    return user
};

UserSchema.statics.findByUsername = async (username) => {
    // Search for a user by username and password.
    const user = await User.findOne({username}).exec()
    if (!user) {
        throw new Error({error: 'Votre mot de passe ou votre identifiant est incorrect'})
    }
    console.log("user", _id)
    return user
};

UserSchema.methods.generateAuthToken = async function () {
    // Generate an auth token for the user
    const user = this;
    // user.tokens = user.tokens.concat({ token })
    // await user.save()
    return jwt.sign({_id: user._id}, config.secret)
}

const User = mongoose.model("User", UserSchema);

module.exports = User
