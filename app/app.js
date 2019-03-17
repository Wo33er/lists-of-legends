// Express dependencies
require('dotenv').load();
const express = require('express');
var exphbs  = require('express-handlebars');
var request = require('request');
var async = require("async");
var bodyParser = require('body-parser');
var stylus = require('stylus');
const app = express();

app.engine('handlebars', exphbs({
    defaultLayout: 'main',
    layoutsDir: __dirname + '/views/layouts',
    helpers: {
        capString: function(value) {
            if(value != null) {
                return value.charAt(0).toUpperCase() + value.slice(1);
            }
            return value;
        }
    },
}));
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views/');
app.use(bodyParser.json());
app.use(stylus.middleware({
    src:  __dirname + "/resources", 
    dest: __dirname + "/public",
    debug: true,
    compress: true
}));

app.use(express.static(__dirname + '/public'));

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

// Routes - General
app.get('/', async (req, res) => {
    var googleAnalytics = null;
    var divisionData = JSON.parse(await redisClient.getAsync("division-characters"));
    var wowData = JSON.parse(await redisClient.getAsync("wow-characters"));
    var destinyData = JSON.parse(await redisClient.getAsync("destiny-characters"));

    if(process.env.PLATFORM == "prod") {
        googleAnalytics = process.env.GOOGLE_ANALYTICS;
    }

    res.render(__dirname + '/views/index', {
        divisionData,
        wowData,
        destinyData,
        googleAnalytics: googleAnalytics
    });
});

app.get('/data/:key', async (req, res) => {
    const { key } = req.params;
    const rawData = await redisClient.getAsync(key);
    return res.json(JSON.parse(rawData));
});

// Routes - Division
var divisionRouter = require('./routes/division-router');
app.use('/division', divisionRouter);

// Routes - WoW
var wowRouter = require('./routes/wow-router');
app.use('/wow', wowRouter);

// Routes - Destiny
var destinyRouter = require('./routes/destiny-router');
app.use('/destiny', destinyRouter);

// Start app
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});