import * as dotenv from 'dotenv';
import BskyAgent from '@atproto/api';

let lastPostID: String = "";

function TakeMinutesFromDate(date: Date, minutes: number) {
    return new Date(date.getTime() - minutes * 60000);
}

// Create a Bluesky Agent
const agent = new BskyAgent({
    service: 'https://bsky.social',
})

// async function post(bleat: string, id: string, link: string, title: string, description: string) {
//     await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! })
//     await agent.post({
//         text: bleat,
//         langs: [ "en-US" ],
//         facets: [
//             {
//                 index: {
//                     byteStart: 0,
//                     byteEnd: 10
//                 },
//                 features: [{
//                     $type: 'app.bsky.richtext.facet#tag',
//                     tag: '#earthquake'
//                 }]
//             }
//         ],
//         embed: {
//             "$type": "app.bsky.embed.external",
//             "external": {
//                 "uri": link,
//                 "title": title + " | USGS",
//                 "description": description,
//             }
//         }
//     })
//     console.log("Just posted!")
//     lastPostID = id
// }

export default async () => {
    dotenv.config();

    interface Earthquake {
        id: string,
        properties: {
            type: string;
            mag: number;
            time: number;
            place: string;
            url: string;
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

    console.log('Starting up...');

    let now = new Date();
    let fiveMinutesAgo = TakeMinutesFromDate(now, 120);
    let startTime = fiveMinutesAgo.toISOString();
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
                console.log(earthquake.id);
                let bleatText = "";
                let description = "";
                const id = earthquake.id,
                      magnitude = earthquake.properties.mag,
                      time = new Date(earthquake.properties.time),
                      type = earthquake.properties.type,
                      location = earthquake.properties.place,
                      link = earthquake.properties.url,
                      title = earthquake.properties.title,
                      latitude = earthquake.geometry.coordinates[0],
                      longitude = earthquake.geometry.coordinates[1],
                      depth = earthquake.geometry.coordinates[2],
                      subBleat = (magnitude >= 2.5 ? ' and to report shaking': '')
                if (time >= TakeMinutesFromDate(now, 1)) {
                        bleatText = `Earthquake Update: A magnitude ${magnitude} ${type} took place ${location} at ${time.toLocaleTimeString('en-US')}.
    For details from the USGS${subBleat}:`;
                        description = `${time.toUTCString()} | ${latitude.toFixed(3)}°N ${longitude.toFixed(3)}°W | ${depth.toFixed(1)} km depth`;
                    console.log(bleatText, id, link, title, description);
                }
            })
        })
        .catch(error => {
            console.error('Error:', error);
        });
}