// routes/divisionRouter.js

var express  = require('express');
var request = require('request');
var async = require("async");
var router = express.Router();

// Redis dependencies/client
const redis = require('redis');
const {promisify} = require('util');
const client = redis.createClient(process.env.REDIS_URL);

const redisClient = {
    ...client,
    getAsync: promisify(client.get).bind(client),
    setAsync: promisify(client.set).bind(client),
    keysAsync: promisify(client.keys).bind(client)
};

router.use(function(req, res, next) {
    next();
});

router.get('/characters/all/:update?', async (req, res) => {
    var divisionCharacters = require("../data/division-characters.js");

    async.map(divisionCharacters, divisionGetFullCharacter, function(error , characterData) {
        characterData.sort(function(a, b) {
            return (b.level_pve - a.level_pve) || (b.gearscore - a.gearscore);
        });
        
        if(error) { console.log("Error: "+ error); }
        else if(req.params.update) {
            redisClient.setAsync("division-characters", JSON.stringify(characterData));
            console.log("Success ~ Updated "+ characterData.length +" Division characters")
        }

        res.type("json");
        res.end(JSON.stringify(characterData));
    });
});

function divisionGetFullCharacter(character, callback) {
    request({
        url: "https://thedivisiontab.com/api/player.php?pid="+ character.id,
        json: true
    }, function (error, response, body) {
        if (error || response.statusCode != 200) {
            console.log("Division endpoint failed");
            console.log(body);
            callback(null);
        } else {
            body.niceName = character.niceName
            callback(null, body);
        }
    });
}

module.exports = router;