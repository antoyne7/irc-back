const express = require('express')
const multer = require('multer')
const bcrypt = require("bcryptjs")
const fs = require('fs')
const middlewares = require('../middlewares')
const User = require("../models/user.model");
const router = express.Router()

// Multer file storage
const storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, 'uploads/users-pictures')
    },
    filename: (req, file, callback) => {
        callback(null, Date.now() + '-' + slugify(file.originalname) + "." + file.mimetype.split("/")[1])
    }
})
const upload = multer({storage})

// Update user picture
router.post('/profile/picture',
    [middlewares.auth.verifyToken, upload.single('picture')],
    async (req, res) => {
        try {
            const oldPicturePath =
                __dirname + '/../uploads/users-pictures/' + req.connectedUser.picture
            if (fs.existsSync(oldPicturePath)) {
                fs.unlinkSync(oldPicturePath)
            }

            req.connectedUser.picture = req.file.filename
            await req.connectedUser.save(err => {
                if (err) {
                    res.status(500).send({message: err});
                    return;
                }
                res.status(201).send({message: "L'avatar à été enregistré avec succès!"});
            });
        } catch (error) {
            res.status(400).send({message: error})
        }
    });

// Update user
router.post('/profile',
    [middlewares.auth.verifyToken],
    async (req, res) => {
        req.connectedUser.username = req.body.username
        req.connectedUser.email = req.body.email
        if (req.body.password.length > 0) {
            if (req.body.password !== req.body.passwordRepeat) {
                res.status(500).send({message: "Les mots de passe ne correspondent pas."});
                return;
            }

            if (req.connectedUser.roles.length === 0 && // User not a guest
                !bcrypt.compareSync(req.body.oldPassword, req.connectedUser.password)) {
                res.status(500).send({message: "Votre mot de passe est incorrect."});
                return;
            }

            req.connectedUser.password = req.body.password
        }

        await req.connectedUser.save(err => {
            if (err) {
                res.status(500).send({message: "Les champs suivants sont déjà utilisé: " + Object.keys(err.keyValue).join(', ')});
                return;
            }
            res.status(200).send({message: "Profil mis à jour."});
        });
    })

router.get('/user/get', [middlewares.auth.verifyToken],
    async (req, res) => {
        const user = await User.findById(req.query.userid).select("id picture username")
        if (!user) {
            res.status(400).send({message: "L'utilisateur n'a pas été trouvé"})
            return
        }
        res.status(200).send({message: "Utilisateur trouvé",user});
    }
)

// Update theme
router.get('/profile/theme',
    [middlewares.auth.verifyToken],
    async (req, res) => {
        req.connectedUser.whiteTheme = (req.query.whiteTheme == "true")

        await req.connectedUser.save(err => {
            if (err) {
                res.status(500).send({message: err});
                return;
            }
            res.status(200).send({message: "Thème mis à jour."});
        });
    })

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


module.exports = router
