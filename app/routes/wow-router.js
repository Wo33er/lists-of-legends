// routes/wowRouter.js

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
    var wowCharacters = require("../data/wow-characters.js");

    async.map(wowCharacters, wowGetFullCharacter, function(error , characterData) {
        characterData.sort(function(a, b) {
            return b.averageItemLevel - a.averageItemLevel;
        });
        
        if(error) { console.log("Error: "+ error); }
        else if(req.params.update) {
            redisClient.setAsync("wow-characters", JSON.stringify(characterData));
            console.log("Success ~ Updated "+ characterData.length +" WoW characters")
        }

        res.type("json");
        res.end(JSON.stringify(characterData));
    });
});

function wowGetFullCharacter(character, callback) {
    request({
        url: "https://us.api.battle.net/wow/character/"+ character.realm +"/"+ character.name +"?locale=en_US&fields=mounts,pets,guild,items&apikey="+ process.env.BLIZZARD_KEY,
        json: true
    }, function (error, response, body) {
        if (error || response.statusCode != 200) {
            console.log("WoW endpoint failed");
            console.log(body);
            callback(null);
        } else {
            callback(null, {
                lastModified: body.lastModified,
                "name": body.name,
                "realm": body.realm,
                "battlegroup": body.battlegroup,
                "class": body.class,
                "race": body.race,
                "gender": body.gender,
                "faction": body.faction,
                "level": body.level,
                "achievements": body.achievementPoints,
                "thumbnail": "http://render-us.worldofwarcraft.com/character/"+ body.thumbnail,
                "inset": "http://render-us.worldofwarcraft.com/character/"+ body.thumbnail.split('-')[0] +"-inset.jpg",
                "totalHonorableKills": body.totalHonorableKills,
                "averageItemLevel": body.items.averageItemLevel,
                "azeriteLevel": body.items.neck.azeriteItem.azeriteLevel,
                "totalPets": body.pets.numCollected,
                "totalMounts": body.mounts.numCollected,
                //"guildName": body.guild.name,
                //"guildAchievements": body.guild.achievementPoints,
                //"guildMembers": body.guild.members
            });
        }
    });
}

router.get('/characters/sort', async (req, res) => {
    var wowCharacters = require("../data/wow-characters.js");

    async.map(wowCharacters, wowGetFullCharacter, function(error , characterData) {
        if(error) { console.log("Error: "+ error); }
        else if(req.params.update) {
            redisClient.setAsync("wow-characters", JSON.stringify(characterData));
            console.log("Success ~ Updated "+ characterData.length +" WoW characters")
        }
        
        characterData.sort(function(a, b) {
            return b.averageItemLevel - a.averageItemLevel;
        });

        res.type("json");
        res.end(JSON.stringify(characterData));
    });
});

module.exports = router;