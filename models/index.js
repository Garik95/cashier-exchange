const conf = require('../conf');
const mongoose = require('mongoose');

const db = mongoose
    .connect(conf.db)
    .then(async () => {
        console.log("Successfully connected to database");
    })
    .catch((error) => {
        console.log("database connection failed. exiting now...");
        console.error(error);
        process.exit(1);
    });
const r = async () => {
    db.AccountMap = require('./accountMap')(mongoose)
    db.Exchange = require('./exchange')(mongoose)
    db.Physical = require('./physical')(mongoose)
    return db
}

r();

module.exports = db;