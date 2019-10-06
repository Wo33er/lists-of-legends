// routes/wowRouter.js

var express  = require('express');
var request = require('request');
const Promise = require("bluebird");
const rp = require("request-promise");
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

// WoW Auth
const credentials = {
    client: {
        id: process.env.BLIZZARD_ID,
        secret: process.env.BLIZZARD_SECRET
    },
    auth: {
        tokenHost: "https://us.battle.net"
    }
};

const oauth2 = require("simple-oauth2").create(credentials);
let token = null;
  
const getToken = () => {
    if (token === null || token.expired()) {
        return oauth2.clientCredentials
        .getToken()
        .then(oauth2.accessToken.create)
        .then(t => {
            token = t;
            return t.token.access_token;
        });
    } 
    else {
        return Promise.resolve(token.token.access_token);
    }
};

router.get("/character/:name?/:realm?", async (req, res) => {
    var character = {};
    if(req.params.name == null) { character.name="armory"; } else { character.name = req.params.name }
    if(req.params.realm == null) { character.realm="thrall"; } else { character.realm = req.params.realm }

    getCharacter(character)
    .then(buffer => {
        return res.send(buffer);
    })
    .catch(err => {
        res.json(err.message);
    })
});

router.get("/characters/all/:update?", async (req, res) => {
    var wowCharacters = require("../data/wow-characters.js");

    Promise.mapSeries(wowCharacters, function(character, index, arrayLength) {
        return getCharacter(character).then(function(data) {
            return data;
        });
    }).then(function(result) {
        result.sort(function(a, b) {
            return b.averageItemLevel - a.averageItemLevel;
        });
        if(req.params.update) {
            redisClient.setAsync("wow-characters", JSON.stringify(result));
            console.log("Success ~ Updated "+ result.length +" WoW characters")
        }

        return res.send(result);
    });
});

router.get('/characters/bff/:update?', async (req, res) => {
    var wowCharacters = require("../data/wow-characters.js");

    Promise.mapSeries(wowCharacters, function(character, index, arrayLength) {
        return getCharacter(character).then(function(data) {
            return data;
        });
    }).then(function(result) {
        result.sort(function(a, b) {
            return b.averageItemLevel - a.averageItemLevel;
        });
        if(req.params.update) {
            redisClient.setAsync("bff-wow-characters", JSON.stringify(result));
            console.log("Success ~ Updated "+ result.length +" WoW characters")
        }

        return res.send(result);
    });
});

const getCharacter = (character) => {
    return getToken().then(token => {
        return rp.get({
            uri: `https://us.api.blizzard.com/wow/character/${character.realm.toLowerCase()}/${character.name.toLowerCase()}`,
            json: true,
            qs: {
                fields: "mounts,pets,guild,items",
                locale: "en_US"
            },
            headers: {
                Authorization: `Bearer ${token}`
            },
            transform: function (body) {
                return {
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
                };
            }
        });
    });
};

module.exports = router;