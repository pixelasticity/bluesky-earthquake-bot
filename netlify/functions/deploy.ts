import { schedule } from "@netlify/functions";
export const handler = schedule("* * * * *", async (event: any) => {
	console.log("Scheduled function executed", Date.now())
    return {
        statusCode: 200,
        body: "Posted"
    }
});