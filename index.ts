import { BskyAgent } from '@atproto/api';
import * as dotenv from 'dotenv';
// import { CronJob } from 'cron';
// import * as process from 'process';

dotenv.config();

interface Earthquake {
	properties: {
		id: string;
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

function TakeMinutesFromDate(date: Date, minutes: any) {
    return new Date(date.getTime() - minutes * 60000);
}
let now = new Date();
let fiveMinutesAgo = TakeMinutesFromDate(now, 600);
let startTime = fiveMinutesAgo.toISOString();

/*
 * Format: geoJSON
 * Minimum Magnitude: 1.0
 * Latitude: 34.14818
 * Longitude: -118.27332
 * Maximum Radius: 100 km
 */
const apiUrl = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=1&latitude=34.14818&longitude=-118.27332&maxradiuskm=100&starttime=" + startTime;
console.log(apiUrl);

// Make a GET request
fetch(apiUrl).then(response => {
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
	console.log(data.features);
	data.features.forEach((earthquake: Earthquake) => {
		let bleatText = "";
		let description = "";
		const magnitude = earthquake.properties.mag,
					time = new Date(earthquake.properties.time),
					type = earthquake.properties.type,
					location = earthquake.properties.place,
					link = earthquake.properties.url,
					title = earthquake.properties.title,
					latitude = earthquake.geometry.coordinates[0],
					longitude = earthquake.geometry.coordinates[1],
					depth = earthquake.geometry.coordinates[2];
		if (time >= TakeMinutesFromDate(now, 1)) {
				bleatText = `Earthquake Update: A magnitude ${magnitude} ${type} took place ${location} at ${time.toLocaleTimeString('en-US')}.
For details from the USGS and to report shaking:`;
				description = `${time.toUTCString()} | ${latitude}°N ${longitude}°W | ${depth} km depth`;
			post(bleatText, link, title, description);
		}
	})
})
.catch(error => {
	console.error('Error:', error);
});

// Create a Bluesky Agent
const agent = new BskyAgent({
	service: 'https://bsky.social',
})

async function post(bleat: string, link: string, title: string, description: string) {
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
}

// // Run this on a cron job
// const scheduleExpressionMinute = '* * * * *'; // Run once every minute for testing
// const scheduleExpression = '0 */3 * * *'; // Run once every three hours in production

// const job = new CronJob(scheduleExpression, main); // change to scheduleExpressionMinute for testing

// job.start();
