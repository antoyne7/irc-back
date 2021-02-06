const dbConfig = require("./db.config")
const db = require("../models");

db.mongoose
    .connect(dbConfig.CONNECT_STRING, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => {
        console.log("Successfully connect to MongoDB.");
    })
    .catch(err => {
        console.error("Connection error", err);
        process.exit();
    });
