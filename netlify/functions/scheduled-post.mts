import api from '@atproto/api';
import * as dotenv from 'dotenv';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import process from 'process';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);

const tz: string = "America/Los_Angeles";
let lastPostID: (number | undefined) = undefined;

const { BskyAgent, RichText } = api;
const agent = new BskyAgent({
    service: 'https://bsky.social',
});

async function post(bleat: string, id: number, link: string, title: string, description: string) {
    try {
        await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! });
        const richText = new RichText({
            text: bleat,
        });
        await richText.detectFacets(agent);
        await agent.post({
            text: richText.text,
            langs: ["en-US"],
            facets: richText.facets,
            embed: {
                "$type": "app.bsky.embed.external",
                "external": {
                    "uri": link,
                    "title": title + " | " + id,
                    "description": description,
                }
            }
        });
        console.log(`Just posted quake ${id}!`);
        lastPostID = id;
    } catch (error) {
        console.error(`Failed to post quake ${id}:`, error);
    }
}

interface Earthquake {
    id: string;
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
    };
    geometry: {
        coordinates: [number, number, number];
    };
}

function getMagnitudeCategory(magnitude: number): string {
    if (magnitude >= 8) return 'great';
    if (magnitude >= 7) return 'major';
    if (magnitude >= 6) return 'strong';
    if (magnitude >= 5) return 'moderate';
    if (magnitude >= 4) return 'light';
    if (magnitude >= 2.5) return 'minor';
    return 'micro';
}

export default async () => {
    dotenv.config();
    console.log('Starting up...');

    const handle = 'earthquakesla.bsky.social';
    const knownQuakes = new Set<string>();

    // 1. Sync from Bluesky (Database-less persistence)
    try {
        console.log('Syncing known quakes from Bluesky feed...');
        const postsRes = await agent.getAuthorFeed({ actor: handle });
        for (const item of postsRes.data.feed) {
            const embed = item.post?.embed;
            if (embed?.$type === 'app.bsky.embed.external#view') {
                const externalEmbed = embed as api.AppBskyEmbedExternal.View;
                const url = externalEmbed.external?.uri;
                if (url) {
                    const id = url.split('/').pop();
                    if (id) knownQuakes.add(id);
                }
            }
        }
        console.log(`Synced ${knownQuakes.size} quakes.`);
    } catch (error) {
        console.error('Error syncing from Bluesky feed:', error);
    }

    // 2. Fetch USGS Data
    let oneHourAgo = dayjs().subtract(60, 'minute');
    let startTime = oneHourAgo.toISOString();
    const apiUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=1&latitude=34.14818&longitude=-118.27332&maxradiuskm=100&starttime=${startTime}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`USGS API error: ${response.status}`);
        
        const data = await response.json();
        console.log(`Fetched ${data.features.length} potential earthquakes.`);

        // 3. Process using for...of to handle async posting correctly
        for (const feature of data.features) {
            const earthquake = feature as Earthquake;
            const code = earthquake.id;
            const magnitude = earthquake.properties.mag;
            const type = earthquake.properties.type;

            // Filter out quarry blasts and already posted quakes
            if (type !== 'earthquake' && magnitude < 2.5) continue;
            if (knownQuakes.has(code)) continue;

            const time = dayjs(earthquake.properties.time).utc();
            const location = earthquake.properties.place;
            const link = earthquake.properties.url;
            const title = earthquake.properties.title;
            const latitude = earthquake.geometry.coordinates[0];
            const longitude = earthquake.geometry.coordinates[1];
            const depth = earthquake.geometry.coordinates[2];
            const category = getMagnitudeCategory(magnitude);
            const subBleat = (magnitude >= 2.5 ? ' and to report shaking' : '');
            const id = parseInt(earthquake.properties.code);

            const bleatText = `#Earthquake Update: A magnitude ${magnitude} ${type} took place ${location} at ${time.tz(tz).format('LTS')}. #${category}\nFor details from the USGS${subBleat}:`;
            const description = `${time.format('YYYY-MM-DD HH:mm:ss [(UTC)]')} | ${latitude.toFixed(3)}°N ${longitude.toFixed(3)}°W | ${depth.toFixed(1)} km depth`;

            if (!isNaN(id) && id !== lastPostID) {
                await post(bleatText, id, link, title, description);
                knownQuakes.add(code);
            }
        }
    } catch (error) {
        console.error('Error processing earthquakes:', error);
    }

    return new Response("Ok");
};