// netlify/functions/fetch-library-entries.js
const fetch = require('node-fetch');

const VALID_STATES = ['WANNA_WATCH', 'WATCHING', 'WATCHED', 'ON_HOLD', 'STOP_WATCHING'];

const QUERY = `
  query($username: String!, $states: [StatusState!], $after: String) {
    user(username: $username) {
      libraryEntries(states: $states, first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          work { annictId title }
        }
      }
    }
  }
`;

exports.handler = async function (event) {
  const { username, states, after } = event.queryStringParameters || {};
  const accessToken = process.env.ANNICT_TOKEN;

  if (!accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ANNICT_TOKEN is required' }) };
  }
  if (!username) {
    return { statusCode: 400, body: JSON.stringify({ error: 'username is required' }) };
  }

  const stateList = states ? states.split(',') : [];
  if (stateList.some((s) => !VALID_STATES.includes(s))) {
    return { statusCode: 400, body: JSON.stringify({ error: `states must be one of ${VALID_STATES.join(', ')}` }) };
  }

  try {
    const response = await fetch('https://api.annict.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { username, states: stateList.length ? stateList : null, after: after || null },
      }),
    });

    const result = await response.json();
    if (!response.ok || result.errors) {
      return { statusCode: response.ok ? 502 : response.status, body: JSON.stringify({ error: 'Failed to fetch data', details: result.errors }) };
    }

    const libraryEntries = result.data.user ? result.data.user.libraryEntries : { nodes: [], pageInfo: { hasNextPage: false } };
    return { statusCode: 200, body: JSON.stringify(libraryEntries) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server Error' }) };
  }
};
