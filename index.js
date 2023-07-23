const express = require("express")
const {Client, LocalAuth} = require("whatsapp-web.js")
const qrcode = require('qrcode-terminal');
const app = express();
const port = 3001;
const http = require('http');
const server = http.createServer(app);



const allsessionObject = {};

const client = new Client({
	puppeteer: {
		headless : true,
		args: ["--no-sandbox"]
	},
	authStrategy: new LocalAuth({
		clientId: "ShibamNaskarJgecClient",
	}),
});

client.on('qr', (qr) => {
	console.log('QR RECEIVED', qr);
	qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
	console.log('Client is ready!');
	
});

client.on('message', message => {
	if(message.body === '!hi') {
		message.reply('Hello This is jgec whatsap bot');
	}
});


client.initialize();