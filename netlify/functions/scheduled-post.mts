import api from '@atproto/api';
import * as dotenv from 'dotenv';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import process from 'process';

const { RichText } = api;

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);

const tz: string = "America/Los_Angeles";
let lastPostID: (number | undefined) = undefined;

// Create a Bluesky Agent
const { BskyAgent } = api;
const agent = new BskyAgent({
    service: 'https://bsky.social',
})

async function post(bleat: string, id: number, link: string, title: string, description: string) {
    await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! })
    const richText = new RichText({
        text: bleat,
    })
    await richText.detectFacets(agent)
    await agent.post({
        text: richText.text,
        langs: [ "en-US" ],
        facets: richText.facets,
        embed: {
            "$type": "app.bsky.embed.external",
            "external": {
                "uri": link,
                "title": title + " | " + id,
                "description": description,
            }
        }
    })
    console.log("Just posted!")
    lastPostID = id
}

interface Earthquake {
    id: string,
    properties: {
        mag: number;
        place: string;
        time: number;
        updated: number;
        url: string;
        sig: number;
        code: string;
        type: string;
        title: string;
    }
    geometry: {
        coordinates: {
            0: number;
            1: number;
            2: number;
        }
    }
}

export default async () => {
    dotenv.config();

    console.log('Starting up...');

    let now = dayjs();
    let twelveHoursAgo = dayjs().subtract(720, 'minute');
    let startTime = twelveHoursAgo.toISOString();
    /*
     * Format: geoJSON
     * Minimum Magnitude: 1.0
     * Latitude: 34.14818
     * Longitude: -118.27332
     * Maximum Radius: 100 km
     */
    const apiUrl = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=1&latitude=34.14818&longitude=-118.27332&maxradiuskm=100&starttime=" + startTime;

    let bleatText: string = "";
    let description: string = "";

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
                const id = parseInt(earthquake.properties.code),
                      magnitude = earthquake.properties.mag,
                      time = dayjs(earthquake.properties.time).utc(),
                      updated = dayjs(earthquake.properties.updated).utc(),
                      type = earthquake.properties.type,
                      location = earthquake.properties.place,
                      link = earthquake.properties.url,
                      title = earthquake.properties.title,
                      latitude = earthquake.geometry.coordinates[0],
                      longitude = earthquake.geometry.coordinates[1],
                      depth = earthquake.geometry.coordinates[2],
                      significance = earthquake.properties.sig,
                      subBleat = (magnitude >= 2.5 ? ' and to report shaking': '');
                let   category: string = '';
                if (magnitude >= 8) { category = 'great'; } else
                if (magnitude >= 7) { category = 'major'; } else
                if (magnitude >= 6) { category = 'strong'; } else
                if (magnitude >= 5) { category = 'moderate'; } else
                if (magnitude >= 4) { category = 'light'; } else
                if (magnitude >= 2.5) { category = 'minor'; } else
                if (magnitude < 2.5) { category = 'micro'; } else
                { return; }
                if (type !== 'earthquake' && magnitude < 2.5) {
                    // Don't post quarry blasts likely felt by no one
                    return;
                } else if (time.isAfter(now.subtract(14.95, 'minute'))) {
                    bleatText = `#Earthquake Update: A magnitude ${magnitude} ${type} took place ${location} at ${time.tz(tz).format('LTS')}. #${category}
For details from the USGS${subBleat}:`;
                    description = `${time.format('YYYY-MM-DD HH:MM:ss [(UTC)]')} | ${latitude.toFixed(3)}°N ${longitude.toFixed(3)}°W | ${depth.toFixed(1)} km depth`;
                    if (lastPostID != undefined && id !== lastPostID) {
                        console.log(updated.toDate())
                        post(bleatText, id, link, title, description);
                    } else if (lastPostID == undefined) {
                        console.log(updated.toDate())
                        post(bleatText, id, link, title, description);
                    } else {
                        // Nothing to post
                        return;
                    }
                } else {
                    // Don't post anything if there are no recent events
                    return;
                }
            })
        })
        .catch(error => {
            console.error('Error:', error);
        });

    return new Response("Ok");
}