import { BskyAgent } from '@atproto/api';
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import * as process from 'process';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import { open } from 'fs/promises';
import path from 'path';

dotenv.config();

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);

const tz: string = "America/Los_Angeles";

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

async function openFile(filePath, data) {
	console.log(filePath);
  try {
    const file = await open(filePath, 'w');
		await file.read()
    // await file.write(data);
    console.log(`Opened file ${filePath}`);
  } catch (error: any) {
    console.error(`Got an error trying to open the file: ${error.message}`);
  }
}

let lastPost: string = "unknown";

console.log('Starting up...');

type FetchFunction = (url: string) => void;
function apiFetch(fn: FetchFunction) {
	console.log('Fetching data @ %s \nLast post: %s', Date.now(), lastPost)
	let now = dayjs();
	let fiveMinutesAgo = dayjs(now).subtract(1440, 'minute')
	let startTime: string = fiveMinutesAgo != undefined ? fiveMinutesAgo.toISOString() : '';
	openFile( __dirname + '/tmp/already-posted.json', 'Do homework' );
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
			const magnitude = earthquake.properties.mag,
						time = dayjs(earthquake.properties.time).utc(),
						type = earthquake.properties.type,
						location = earthquake.properties.place,
						link = earthquake.properties.url,
						title = earthquake.properties.title,
						latitude = earthquake.geometry.coordinates[0],
						longitude = earthquake.geometry.coordinates[1],
						depth = earthquake.geometry.coordinates[2],
						subBleat: string = (magnitude >= 2.5 ? ' and to report shaking': '');
			if (time.valueOf() >= dayjs().subtract(10, 'minute').valueOf()) {
					bleatText = `Earthquake Update: A magnitude ${magnitude} ${type} took place ${location} at ${time.tz(tz)}.
For details from the USGS${subBleat}:`;
					description = `${time.format('YYYY-MM-DD HH:MM:ss [(UTC)]')} | ${latitude.toFixed(3)}°N ${longitude.toFixed(3)}°W | ${depth.toFixed(1)} km depth`;
				post(bleatText, link, title, description);
			}
		})
	})
	.catch(error => {
		console.error('Error:', error);
	});
}

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

// Run this on a cron job
const scheduleExpressionMinute = '* * * * *'; // Run once every minute for testing
const scheduleExpression = '0 */3 * * *'; // Run once every three hours in production

const job = new CronJob(scheduleExpressionMinute, apiFetch); // change to scheduleExpressionMinute for testing

job.start();
