const express = require('express')
const middlewares = require('../middlewares')

const router = express.Router()

// Test route
router.get("/test", (req, res) => {
    res.json({message: "Welcome Herobrine to the application."});
});

// Auth route
router.get("/cool",
    [middlewares.auth.verifyToken],
    (req, res) => {
    res.json({message: "Connecter mon pote Herobrine."});
});

module.exports = router
