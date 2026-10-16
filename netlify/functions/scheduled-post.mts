import api from '@atproto/api';
import * as dotenv from 'dotenv';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import process from 'process';
import { calculateFeltRadius } from '../../socalEarthquakeRadius.mjs';
import { calculateZoom } from '../../radiusToZoom.mjs';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);

const tz: string = "America/Los_Angeles";
let lastPostID: (number | undefined) = undefined;

const { BskyAgent, RichText } = api;
const agent = new BskyAgent({
    service: 'https://bsky.social',
});

// Updated post function: Removed login from here to avoid redundant API calls
async function post(bleat: string, id: number, link: string, title: string, description: string, blobUri?: string, altText?: string) {
    try {
        const richText = new RichText({
            text: bleat,
        });
        await richText.detectFacets(agent);

        // EXPLICIT EMBED CONSTRUCTION: Fixes the image-missing bug
        const embed: any = {
            "$type": 'app.bsky.embed.external',
            "external": {
                "uri": link,
                "title": title + ' | ' + id,
                "description": description,
            }
        };

        // Only attach the thumbnail and alt text if they were successfully generated
        if (blobUri) {
            embed.external.thumb = blobUri;
            if (altText) {
                embed.external.alt = altText;
            }
            console.log(`Attaching image blob: ${blobUri}`);
        } else {
            console.warn(`Failed to attach image blob: ${blobUri}`);
        }

        await agent.post({
            text: richText.text,
            langs: ["en-US"],
            facets: richText.facets,
            embed: embed
        });
        console.log(`Successfully posted quake ${id}!`);
        lastPostID = id;
    } catch (error) {
        console.error(`API Error: Failed to post quake ${id}:`, error);
        throw error; // Re-throw so the main loop knows it failed
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
    console.log('Starting scheduled earthquake check...');

    // Use env var or fallback to default
    const handle = process.env.BLUESKY_HANDLE || 'earthquakesla.bsky.social';
    const knownQuakes = new Set<string>();

    try {
        // Login ONCE per execution
        console.log('Authenticating with Bluesky...');
        await agent.login({ 
            identifier: process.env.BLUESKY_USERNAME!, 
            password: process.env.BLUESKY_PASSWORD! 
        });

        // 1. Sync from Bluesky feed to prevent double-posting
        console.log(`Syncing known quakes from feed: ${handle}...`);
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
        console.log(`Synced ${knownQuakes.size} existing quake IDs.`);
    } catch (error) {
        console.error('Initialization Error (Auth/Sync):', error);
        // If we can't login, we can't post, so we stop here.
        return new Response("Internal Error during initialization", { status: 500 });
    }

    // 2. Fetch USGS Data
    let lookbackHours = 3;
    let startTime = dayjs().subtract(lookbackHours, 'hour').toISOString();
    const apiUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=1&latitude=34.14818&longitude=-118.27332&maxradiuskm=100&starttime=${startTime}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`USGS API error: ${response.status}`);
        
        const data = await response.json();
        console.log(`USGS reports ${data.features.length} events in the last hour.`);

        // 3. Process and Post
        for (const feature of data.features) {
            const earthquake = feature as Earthquake;
            const code = earthquake.id;
            const magnitude = earthquake.properties.mag;
            const type = earthquake.properties.type;

            // Guard against null magnitude
            if (magnitude === null || magnitude === undefined) {
                console.warn(`Skipping ${code}: Magnitude is missing.`);
                continue;
            }

            // Skip quarry blasts and already posted quakes
            if (type !== 'earthquake' && magnitude < 2.5) {
                console.log(`Skipping ${code}: Type is ${type} and magnitude ${magnitude} is too low.`);
                continue;
            }
            if (knownQuakes.has(code)) {
                console.log(`Skipping ${code}: Already posted to Bluesky.`);
                continue;
            }

            const time = dayjs(earthquake.properties.time).utc();
            const location = earthquake.properties.place;
            const link = earthquake.properties.url;
            const title = earthquake.properties.title;
            const latitude = earthquake.geometry.coordinates[0];
            const longitude = earthquake.geometry.coordinates[1];
            const depth = earthquake.geometry.coordinates[2];
            const TARGET_MMI = 2.5;
            const category = getMagnitudeCategory(magnitude);
            const subBleat = (magnitude >= 2.5 ? ' and to report shaking' : '');
            const id = parseInt(earthquake.properties.code);

            const seismicData = calculateFeltRadius(magnitude, depth, TARGET_MMI);
            const radius = seismicData.radius;
            const zoom = calculateZoom(radius);

            let blobUri: string | undefined = undefined;
            try {
                const apiKey = process.env.GEOAPIFY_API_KEY;
                const mapUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-bright-smooth&center=lonlat%3A${longitude}%2C${latitude}&zoom=${zoom}&bearing=0&pitch=0&width=644&height=322&scaleFactor=1&marker=lonlat%3A${longitude}%2C${latitude}%3Bcolor%3A%23ff0000&apiKey=${apiKey}`;

                console.log(`DEBUG: Requesting map from: ${mapUrl}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000)

                const imageResponse = await fetch(mapUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0...' }, 
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                console.log(`DEBUG: Map Response Status: ${imageResponse.status}`);

                if (imageResponse.ok) {
                    // Convert the response into a binary Buffer
                    const arrayBuffer = await imageResponse.arrayBuffer();
                    console.log(`DEBUG: Image Buffer Size: ${arrayBuffer.byteLength} bytes`);

                    const imageBuffer = Buffer.from(arrayBuffer);

                    console.log('DEBUG: Uploading blob to Bluesky...');
                    const uploadResponse = await agent.uploadBlob(
                        imageBuffer as unknown as Uint8Array, 
                        {
                            encoding: 'image/jpeg',
                        } as any
                    ) as any;

                    console.log('DEBUG: Upload Response:', JSON.stringify(uploadResponse));

                    blobUri = uploadResponse.data.blob.ref.$link;
                    console.log(`DEBUG: Final Blob URI: ${blobUri}`);
                } else {
                    console.warn(`Map API returned ${imageResponse.status} for ${code}. Proceeding without image.`);
                }
            } catch (imgError) {
                console.error(`Image generation failed for ${code}:`, imgError);
                console.warn(`Proceeding to post ${code} without an image.`);
            }
            const altText = `Map showing the epicenter of a magnitude ${magnitude.toFixed(1)} earthquake at ${latitude.toFixed(3)}N, ${longitude.toFixed(3)}W. The map is zoomed to show the estimated felt area.`;

            const bleatText = `#Earthquake Update: A magnitude ${magnitude.toFixed(2)} ${type} took place ${location} at ${time.tz(tz).format('LTS')}. #${category}\nFor details from the USGS${subBleat}:`;
            const description = `${time.format('YYYY-MM-DD HH:mm:ss [(UTC)]')} | ${latitude.toFixed(3)}°N ${longitude.toFixed(3)}°W | ${depth.toFixed(1)} km depth`;

            if (!isNaN(id) && !knownQuakes.has(code)) {
                console.log(`New quake detected (${code}). Posting...`);
                await post(
                    bleatText,
                    id as number,
                    link as string,
                    title as string,
                    description as string,
                    blobUri,
                    altText as string
                );
                knownQuakes.add(code);
            }
        }
    } catch (error) {
        console.error('Error during USGS processing loop:', error);
    }

    console.log(`Check completed successfully at ${dayjs().format()}`);
    return new Response("Check completed");
};