import fetch from 'node-fetch';

const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST' });
console.log(res.status);
