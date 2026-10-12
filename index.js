"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@atproto/api");
const dotenv = __importStar(require("dotenv"));
const cron_1 = require("cron");
const process = __importStar(require("process"));
const dayjs_1 = __importDefault(require("dayjs"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
const localizedFormat_js_1 = __importDefault(require("dayjs/plugin/localizedFormat.js"));
const promises_1 = require("fs/promises");
dotenv.config();
dayjs_1.default.extend(utc_1.default);
dayjs_1.default.extend(timezone_1.default);
dayjs_1.default.extend(localizedFormat_js_1.default);
const tz = "America/Los_Angeles";
async function openFile(filePath, data) {
    console.log(filePath);
    try {
        const file = await (0, promises_1.open)(filePath, 'w');
        await file.read();
        // await file.write(data);
        console.log(`Opened file ${filePath}`);
    }
    catch (error) {
        console.error(`Got an error trying to open the file: ${error.message}`);
    }
}
let recentPosts = [];
console.log('Starting up...');
function apiFetch(fn) {
    console.log('Fetching data @ %s \nLast post: %s', Date.now(), recentPosts);
    let now = (0, dayjs_1.default)();
    let fiveMinutesAgo = (0, dayjs_1.default)(now).subtract(1440, 'minute');
    let startTime = fiveMinutesAgo != undefined ? fiveMinutesAgo.toISOString() : '';
    openFile(__dirname + '/data/earthquake_ids.txt', 'Do homework');
    /*
     * Format: geoJSON
     * Minimum Magnitude: 1.0
     * Latitude: 34.14818
     * Longitude: -118.27332
     * Maximum Radius: 100 km
     */
    const apiUrl = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=1&latitude=34.14818&longitude=-118.27332&maxradiuskm=100&starttime=" + startTime;
    // Make a GET request
    fetch(apiUrl).then(response => {
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Data not found');
            }
            else if (response.status === 500) {
                throw new Error('Server error');
            }
            else {
                throw new Error('Network response was not ok');
            }
        }
        return response.json();
    })
        .then(data => {
        data.features.forEach((earthquake) => {
            console.log(earthquake.id);
            let bleatText = "";
            let description = "";
            const id = earthquake.id, magnitude = earthquake.properties.mag, time = (0, dayjs_1.default)(earthquake.properties.time).utc(), type = earthquake.properties.type, location = earthquake.properties.place, link = earthquake.properties.url, title = earthquake.properties.title, latitude = earthquake.geometry.coordinates[0], longitude = earthquake.geometry.coordinates[1], depth = earthquake.geometry.coordinates[2], subBleat = (magnitude >= 2.5 ? ' and to report shaking' : '');
            if (time.valueOf() >= (0, dayjs_1.default)().subtract(10, 'minute').valueOf()) {
                bleatText = `Earthquake Update: A magnitude ${magnitude} ${type} took place ${location} at ${time.tz(tz)}.
For details from the USGS${subBleat}:`;
                description = `${time.format('YYYY-MM-DD HH:MM:ss [(UTC)]')} | ${latitude.toFixed(3)}°N ${longitude.toFixed(3)}°W | ${depth.toFixed(1)} km depth`;
                post(bleatText, link, title, description);
                recentPosts.push(id);
            }
        });
    })
        .catch(error => {
        console.error('Error:', error);
    });
}
// Create a Bluesky Agent
const agent = new api_1.BskyAgent({
    service: 'https://bsky.social',
});
async function post(bleat, link, title, description) {
    await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });
    await agent.post({
        text: bleat,
        langs: ["en-US"],
        facets: [
            {
                index: {
                    byteStart: 0,
                    byteEnd: 10
                },
                features: [{
                        $type: 'app.bsky.richtext.facet#tag',
                        tag: '#earthquake'
                    }]
            }
        ],
        embed: {
            "$type": "app.bsky.embed.external",
            "external": {
                "uri": link,
                "title": title + " | USGS",
                "description": description,
            }
        }
    });
    console.log("Just posted!");
}
// Run this on a cron job
const scheduleExpressionMinute = '* * * * *'; // Run once every minute for testing
const scheduleExpression = '0 */3 * * *'; // Run once every three hours in production
const job = new cron_1.CronJob(scheduleExpressionMinute, apiFetch); // change to scheduleExpressionMinute for testing
job.start();
