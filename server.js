const express = require("express");
const cors = require("cors");
const http = require("http");

//HTTPS
// const https = require('https');
const fs = require('fs');

const app = express();

// const options = {
//     key: fs.readFileSync('ssl/key.pem'),
//     cert: fs.readFileSync('ssl/cert.pem')
// };

const corsOptions = {
    origin: ["https://epitech-irc-api.ew.r.appspot.com","http://localhost:3000"],

};

const server = http.createServer(app);
// const https_server = https.createServer(options, app);

app.use(cors(corsOptions));
// parse requests of content-type - application/json
app.use(express.json());
// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({extended: true}));

// serve static files
app.use(express.static(__dirname + "/uploads"));

// Connect to Database
require("./database");

// Use routes
require("./routers")(app);

//Socket IO
require("./socketio")(server);

// require("./socketio")(https_server);

// Start listening
const PORT = process.env.PORT || 65080;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});

// Start listening
// const HTTPS_PORT = 8443;
// https_server.listen(HTTPS_PORT, () => {
//     console.log(`Server is running on port ${HTTPS_PORT}.`);
// });
