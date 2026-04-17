// netlify/functions/calendar.js
// Fetches events from Google Calendar for the given week
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN

const fetch = require("node-fetch");

const CALENDAR_ID = "steinerjordan77@gmail.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_URL = "https://www.googleapis.com/calendar/v3/calendars";

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token refresh failed: " + JSON.stringify(data));
  return data.access_token;
}

function parseEvent(ev) {
  const sum = ev.summary || "";
  const colon = sum.indexOf(":");
  const name = colon > 0 ? sum.slice(0, colon).trim() : sum.trim();
  let desc = "";
  if (ev.description) {
    const lines = ev.description.split("\n");
    for (const line of lines) {
      if (line.toLowerCase().startsWith("additional notes")) {
        desc = line.replace(/additional notes\s*[-–:]\s*/i, "").trim();
        break;
      }
    }
  }
  return {
    id:    ev.id,
    name,
    desc,
    loc:   ev.location || "",
    start: ev.start?.dateTime || ev.start?.date || "",
    end:   ev.end?.dateTime   || ev.end?.date   || "",
  };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    // Get week bounds from query params, default to current week
    const params = event.queryStringParameters || {};
    let tMin = params.tMin;
    let tMax = params.tMax;

    if (!tMin || !tMax) {
      const now = new Date();
      const day = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 7);
      tMin = mon.toISOString();
      tMax = sun.toISOString();
    }

    const token = await getAccessToken();
    const url = `${CAL_URL}/${encodeURIComponent(CALENDAR_ID)}/events`
      + `?singleEvents=true&orderBy=startTime&maxResults=50`
      + `&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`;

    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();

    if (data.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.error.message }) };
    }

    const events = (data.items || [])
      .filter(ev => ev.summary && ev.start && (ev.start.dateTime || ev.start.date))
      .map(parseEvent);

    return { statusCode: 200, headers, body: JSON.stringify({ events, weekKey: tMin.slice(0, 10) }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
