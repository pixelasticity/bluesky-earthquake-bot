import api from '@atproto/api';
import * as dotenv from 'dotenv';
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const tz: string = "America/Los_Angeles";
let lastPostID: string = "";

function TakeMinutesFromDate(date: Date, minutes: number) {
    return new Date(date.getTime() - minutes * 60000);
}

// Create a Bluesky Agent
const { BskyAgent } = api;
const agent = new BskyAgent({
    service: 'https://bsky.social',
})

async function post(bleat: string, id: string, link: string, title: string, description: string) {
    await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! })
    await agent.post({
        text: bleat,
        langs: [ "en-US" ],
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
    })
    console.log("Just posted!")
    lastPostID = id
}

export default async () => {
    dotenv.config();

    interface Earthquake {
        id: string,
        properties: {
            type: string;
            mag: number;
            time: number;
            updated: number;
            place: string;
            url: string;
            title: string;
            sig: number;
        }
        geometry: {
            coordinates: {
                0: number;
                1: number;
                2: number;
            }
        }
    }

    console.log('Starting up...');

    let now: Date = new Date();
    let twelveHoursAgo = TakeMinutesFromDate(now, 720);
    let startTime = twelveHoursAgo.toISOString();
    /*
     * Format: geoJSON
     * Minimum Magnitude: 1.0
     * Latitude: 34.14818
     * Longitude: -118.27332
     * Maximum Radius: 100 km
     */
    const apiUrl = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=1&latitude=34.14818&longitude=-118.27332&maxradiuskm=100&starttime=" + startTime;

    const earthquakes = await fetch(apiUrl)
        .then(response => {
            console.log('Fetching data @ %s \nLast post: %s', Date.now(), lastPostID)
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Data not found');
                } else if (response.status === 500) {
                    throw new Error('Server error');
                } else {
                    throw new Error('Network response was not ok');
                }
            }
            return response.json();
        })
        .then(data => {
            data.features.forEach((earthquake: Earthquake) => {
                now = new Date();
                let bleatText = "";
                let description = "";
                const id = earthquake.id,
                      magnitude = earthquake.properties.mag,
                      time = new Date(earthquake.properties.time),
                      updated = new Date(earthquake.properties.updated),
                      type = earthquake.properties.type,
                      location = earthquake.properties.place,
                      link = earthquake.properties.url,
                      title = earthquake.properties.title,
                      latitude = earthquake.geometry.coordinates[0],
                      longitude = earthquake.geometry.coordinates[1],
                      depth = earthquake.geometry.coordinates[2],
                      significance = earthquake.properties.sig,
                      subBleat = (magnitude >= 2.5 ? ' and to report shaking': '');
                if (updated.getTime() >= TakeMinutesFromDate(now, 1.75).getTime()) {
                    bleatText = `Earthquake Update: A magnitude ${magnitude} ${type} took place ${location} at ${time.toLocaleTimeString('en-US')}.
For details from the USGS${subBleat}:`;
                    description = `${time.toUTCString()} | ${latitude.toFixed(3)}°N ${longitude.toFixed(3)}°W | ${depth.toFixed(1)} km depth`;
                    post(bleatText, id, link, title, description);
                } else {
                    console.log(time.getTime(), TakeMinutesFromDate(now, 1.75).getTime());
                    return
                }
            })
        })
        .catch(error => {
            console.error('Error:', error);
        });
}