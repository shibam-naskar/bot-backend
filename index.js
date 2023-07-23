const express = require("express")
const {Client, LocalAuth} = require("whatsapp-web.js")
const qrcode = require('qrcode-terminal');
const app = express();
const port = 3001;
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server,{
	cors: {
		origin: "http://localhost:3000",
		methods: ["GET","POST"]
	}
});

app.get('/', (req, res) => {
	res.send('<h1>Hello world</h1>');
  });

  server.listen(port, () => {
	console.log('listening on : ',port);
  });



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



io.on('connection', (socket) => {
	console.log('a user connected',socket.id);
	socket.on('disconnect', () => {
	  console.log('user disconnected');
	});

	socket.on('connected', (data)=>{
		console.log("connected to the server", data);
		socket.emit("connect","server got connected");
	})

	client.on('qr', (qr) => {
		console.log('QR RECEIVED', qr);
		socket.emit("qr",qr);
	});

	client.on('ready', () => {
		console.log('Client is ready!');
		socket.emit("ready","Client is Ready")
		
	});

	client.on("disconnected",()=>{
		console.log("client Got Disconnected")
		socket.emit("disconnect","Client is Ready")
	})
  });

client.initialize();