// routes/destinyRouter.js

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
    var destinyCharacters = require("../data/destiny-characters.js");

    async.map(destinyCharacters, destinyGetFullProfile, function(error , characterData) {
        characterData.sort(function(a, b) {
            return b.characters[0].light - a.characters[0].light;
        });
        
        if(error) { console.log("Error: "+ error); }
        else if(req.params.update) {
            redisClient.setAsync("destiny-characters", JSON.stringify(characterData));
            console.log("Success ~ Updated "+ characterData.length +" Destiny characters")
        }

        res.type("json");
        res.end(JSON.stringify(characterData));
    });
});

router.get('/characters/bff/:update?', async (req, res) => {
    var destinyCharacters = require("../data/bff-destiny-characters.js");

    async.map(destinyCharacters, destinyGetFullProfile, function(error , characterData) {
        characterData.sort(function(a, b) {
            return b.characters[0].light - a.characters[0].light;
        });
        
        if(error) { console.log("Error: "+ error); }
        else if(req.params.update) {
            redisClient.setAsync("bff-destiny-characters", JSON.stringify(characterData));
            console.log("Success ~ Updated "+ characterData.length +" Destiny characters")
        }

        res.type("json");
        res.end(JSON.stringify(characterData));
    });
});

function destinyGetFullProfile(character, callback) {
    async.waterfall([
        // Get foundation character information
        function(callback) {
            destinyGetProfileByAccountId(character, callback);
        },
        // Get character stats manifest
        function(characterData, callback) {
            destinyGetCharacterStatsByCharacterId(characterData, callback);
        }
    ], function (error, result) {
        if (error) { return callback(error); };
        callback(null, result);
    });
}

function destinyGetProfileByAccountId(character, callback) {
    // Future valuable components; ?components=ProfileProgression,CharacterProgressions
    request({
        url: "http://www.bungie.net/Platform/Destiny2/"+ character.platform +"/Profile/"+ character.id +"/?components=profiles,Records,Characters,CharacterEquipment",
        json: true,
        headers: {'X-API-Key': process.env.BUNGIE_KEY}
    }, function (error, response, body) {
        if (error || body.ErrorCode != 1) {
            return callback("Destiny profile endpoint failed");
        } else {
            var characterData = {
                "lastPlayed": body.Response.profile.data.dateLastPlayed,
                "membershipType": body.Response.profile.data.userInfo.membershipType,
                "membershipId": body.Response.profile.data.userInfo.membershipId,
                "displayName": body.Response.profile.data.userInfo.displayName,
                "triumphScore": body.Response.profileRecords.data.score,
                "niceName": character.niceName
            }
            characterData.characters = [];
            body.Response.profile.data.characterIds.forEach((value, index) => {
                characterData.characters[index] = {
                    "id": value,
                    "lastPlayed": body.Response.characters.data[value].dateLastPlayed,
                    "minutesPlayedThisSession": body.Response.characters.data[value].minutesPlayedThisSession,
                    "minutesPlayedTotal": body.Response.characters.data[value].minutesPlayedTotal,
                    "light": body.Response.characters.data[value].light,
                    "race": body.Response.characters.data[value].raceType,
                    "class": body.Response.characters.data[value].classType,
                    "gender": body.Response.characters.data[value].genderType,
                    "emblem": "http://bungie.net" + body.Response.characters.data[value].emblemPath,
                    "emblemId": body.Response.characters.data[value].emblemHash,
                    "emblemColor": body.Response.characters.data[value].emblemColor,
                    "level": body.Response.characters.data[value].levelProgression.level,
                    "levelPercentNext": body.Response.characters.data[value].percentToNextLevel,
                }
                if(typeof body.Response.characters.data[value].emblemBackgroundPath == 'undefined') {
                    characterData.characters[index].emblemBg = "/images/destiny-emblem.jpg";
                }
                else {
                    characterData.characters[index].emblemBg = "http://bungie.net" + body.Response.characters.data[value].emblemBackgroundPath;
                }
                characterData.characters[index].hashes = {};
                characterData.characters[index].hashes.stats = body.Response.characters.data[value].stats;
                characterData.characters[index].hashes.equipment = body.Response.characterEquipment.data[value].items;
                // TODO: Uncomment when I utilize CharacterProgressions data in the future
                // characterData.characters[index].hashes.progressions = body.Response.characterProgressions.data[value].progressions;
                // characterData.characters[index].hashes.factions = body.Response.characterProgressions.data[value].factions;
                // characterData.characters[index].hashes.milestones = body.Response.characterProgressions.data[value].milestones;
                // characterData.characters[index].hashes.uninstancedItemObjectives = body.Response.characterProgressions.data[value].uninstancedItemObjectives;
                // characterData.characters[index].hashes.checklists = body.Response.characterProgressions.data[value].checklists;
                // characterData.characters[index].hashes.records = body.Response.characterProgressions.data[value].records;
            });
            characterData.characters.sort(function(a, b) {
                return b.light - a.light;
            });
            callback(null, characterData);
        }
    });
}

function destinyGetCharacterStatsByCharacterId(characterData, callback) {
    async.forEachOf(characterData.characters, function (value1, key1, callback1) {
        characterData.characters[key1].stats = {};
        async.forEachOf(characterData.characters[key1].hashes.stats, function (value2, key2, callback2) {
            request({
                url: "http://www.bungie.net/Platform/Destiny2/Manifest/DestinyStatDefinition/"+ key2,
                json: true,
                headers: {'X-API-Key': process.env.BUNGIE_KEY}
            }, function (error, response, body) {
                if (error || body.ErrorCode != 1) {
                    return callback2("Destiny stats endpoint failed");
                } else {
                    characterData.characters[key1].stats[body.Response.displayProperties.name] = {
                        "name": body.Response.displayProperties.name,
                        "description": body.Response.displayProperties.description,
                        "icon": "http://bungie.net"+ body.Response.displayProperties.icon,
                        "hash": key1,
                        "value": value2
                    }
                    callback2(null, characterData);
                }
            });
        }, function (error) {
            if (error) { return callback1(error); };
            callback1(null, characterData);
        });
    }, function (error) {
        if (error) { return callback(error); };
        callback(null, characterData);
    });
}

// Single character profile (raw data for testing purposes)
router.get('/character/:platform?/:accountId?', async (req, res) => {
    var character = {};
    if(req.params.platform == null) { character.platform="3"; } else { character.platform = req.params.platform }
    if(req.params.accountId == null) { character.id="4611686018467342484"; } else { character.id = req.params.accountId }

    destinyGetProfileByAccountId(character, function(error, callback) {
        res.type('json');
        res.end(JSON.stringify(callback));
    });
});

// All Clan members with basic profile details (raw data for testing purposes)
router.get('/clan/members/:clanId?', async (req, res) => {
    if(req.params.clanId == null) { clanId = "2109427"; } else { clanId = req.params.clanId }

    destinyGetClanMembersByClanId(clanId, function(error, callback) {
        var destinyData = callback;
    
        res.render(__dirname + '/../views/clan-members', {
            destinyData
        });
    });
});

// All Clan members (raw data for testing purposes)
router.get('/clan/:clanId?', async (req, res) => {
    if(req.params.clanId == null) { clanId = "2109427"; } else { clanId = req.params.clanId }

    destinyGetClanByClanId(clanId, function(error, callback) {
        res.send(callback)
    });
});

function destinyGetClanByClanId(clanId, callback) {
    request({
        url: "http://www.bungie.net/Platform/GroupV2/"+ clanId +"/Members/",
        json: true,
        headers: {'X-API-Key': process.env.BUNGIE_KEY}
    }, function (error, response, body) {
        if (error || body.ErrorCode != 1) {
            console.log("Destiny clan endpoint failed");
        } else {
            callback(null, body.Response.results);
        }
    });
}

function destinyGetClanMembersByClanId(character, callback) {
    async.waterfall([
        // Get clan information
        function(callback) {
            destinyGetClanByClanId(clanId, function(error, clanData) {
                callback(null, clanData);
            });
        },
        // Get clan character stats
        function(clanData, callback) {
            async.map(clanData, destinyGetBasicProfileByAccountId, function(error , characterData) {
                characterData.sort(function(a, b) {
                    return b.characters[0].light - a.characters[0].light;
                });
                callback(null, characterData);
            });
        }
    ], function (error, result) {
        if (error) { return console.log("Destiny clan members endpoint failed"); };
        callback(null, result);
    });
}

function destinyGetBasicProfileByAccountId(character, callback) {
    var characterPlatform = character.destinyUserInfo.membershipType;
    var characterId = character.destinyUserInfo.membershipId;
    
    request({
        url: "http://www.bungie.net/Platform/Destiny2/"+ characterPlatform +"/Profile/"+ characterId +"/?components=profiles,Characters",
        json: true,
        headers: {'X-API-Key': process.env.BUNGIE_KEY}
    }, function (error, response, body) {
        if (error || body.ErrorCode != 1) {
            return callback("Destiny basic profile endpoint failed");
        } else {
            var lastPlayed = new Date(body.Response.profile.data.dateLastPlayed.split('T')[0]);

            var characterData = {
                "lastPlayed": lastPlayed.toLocaleDateString("en-US", { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
                "membershipType": body.Response.profile.data.userInfo.membershipType,
                "membershipId": body.Response.profile.data.userInfo.membershipId,
                "displayName": body.Response.profile.data.userInfo.displayName,
            }
            characterData.characters = [];
            body.Response.profile.data.characterIds.forEach((value, index) => {
                characterData.characters[index] = {
                    "id": value,
                    "light": body.Response.characters.data[value].light,
                }
            });
            characterData.characters.sort(function(a, b) {
                return b.light - a.light;
            });
            callback(null, characterData);
        }
    });
}

// Item manifest details (raw data for testing purposes)
router.get('/manifest/:manifest?/:hash?', async (req, res) => {
    if(req.params.manifest == null) { manifest = "DestinyInventoryItemDefinition"; } else { manifest = req.params.manifest }
    if(req.params.hash == null) { hash = "347366834"; } else { hash = req.params.hash }
    
    request({
        url: "http://www.bungie.net/Platform/Destiny2/Manifest/"+ manifest +"/"+ hash,
        json: true,
        headers: {'X-API-Key': process.env.BUNGIE_KEY}
    }, function (error, response, body) {
        if (error || body.ErrorCode != 1) {
            console.log("Destiny manifest endpoint failed");
        } else {
            return res.send(body);
        }
    });
});

// Character equipment details (raw data for testing purposes)
router.get('/equipment-details/:platform?/:accountId?/:itemId?', async (req, res) => {
    if(req.params.platform == null) { platform = "3"; } else { platform = req.params.platform }
    if(req.params.accountId == null) { accountId = "4611686018467342484"; } else { accountId = req.params.accountId }
    if(req.params.itemId == null) { itemId = "6917529069673234457"; } else { itemId = req.params.itemId }
    
    request({
        url: "http://www.bungie.net/Platform/Destiny2/"+ platform +"/Profile/"+ accountId +"/Item/"+ itemId +"?components=ItemInstances,ItemPerks,ItemCommonData",
        json: true,
        headers: {'X-API-Key': bungiprocess.env.BUNGIE_KEYeKey}
    }, function (error, response, body) {
        if (error || body.ErrorCode != 1) {
            console.log("Destiny endpoint failed");
        } else {
            return res.send(body);
        }
    });
});

module.exports = router;