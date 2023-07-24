const express = require("express")
const { Client, LocalAuth , MessageMedia } = require("whatsapp-web.js")
const qrcode = require('qrcode-terminal');
const schedule = require('node-schedule');
const translate = require('translate-google');
const axios = require('axios');
const fs = require('fs');
const app = express();
const port = 3001;
const http = require('http');
const { Configuration, OpenAIApi } = require("openai");
const gtts = require('gtts');
const server = http.createServer(app);



const allsessionObject = {};
let reminders = [];
let sessionData;
let groupsData = {};
let birthdaysData = {};
let birthdayGroupIds = [];


const GROUPS_DATA_FILE_PATH = './groupsData.json';
const BIRTHDAYS_DATA_FILE_PATH = './birthdaysData.json';
const JSERVICE_API_URL = 'http://jservice.io/api/random';
const QUESTION_TIMEOUT = 20 * 1000;
const OPENAI_API_KEY = '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';

const configuration = new Configuration({
	apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);



function loadGroupsData() {
	if (fs.existsSync(GROUPS_DATA_FILE_PATH)) {
		const data = fs.readFileSync(GROUPS_DATA_FILE_PATH);
		groupsData = JSON.parse(data);
	}
}

function saveGroupsData() {
	fs.writeFile(GROUPS_DATA_FILE_PATH, JSON.stringify(groupsData, null, 2), (err) => {
		if (err) {
			console.error('Error saving groups data:', err);
		}
	});
}

function loadBirthdaysData() {
	if (fs.existsSync(BIRTHDAYS_DATA_FILE_PATH)) {
		const data = fs.readFileSync(BIRTHDAYS_DATA_FILE_PATH);
		birthdaysData = JSON.parse(data);
	}
}

function saveBirthdaysData() {
	fs.writeFile(BIRTHDAYS_DATA_FILE_PATH, JSON.stringify(birthdaysData, null, 2), (err) => {
		if (err) {
			console.error('Error saving birthdays data:', err);
		}
	});
}

function updateBirthdayGroupIds() {
	birthdayGroupIds = Object.keys(birthdaysData);
}






const client = new Client({
	puppeteer: {
		headless: true,
		args: ["--no-sandbox"]
	},
	authStrategy: new LocalAuth({
		clientId: "ShibamNaskarJgecClient",
	}),
});

client.on('qr', (qr) => {
	console.log('QR RECEIVED', qr);
	qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
	console.log('Client is ready!');
	loadGroupsData();
	loadBirthdaysData();
	updateBirthdayGroupIds();

	// Schedule the daily birthday check at 12:19 AM
	schedule.scheduleJob('46 1 * * *', sendBirthdayWishes);
});

client.on('message', async (msg) => {
	const chat = await msg.getChat();
	const senderId = msg.from;
	const body = msg.body.trim();
	// const mentions = await msg.getMentions();

	if (msg.body === '!ping') {
		await msg.reply('Pong!');
	} else if (msg.body.startsWith('!remindme ')) {
		const timeAndMessage = msg.body.replace('!remindme ', '').split('|');
		const time = timeAndMessage[0].trim();
		const reminderMessage = timeAndMessage[1].trim();
		scheduleReminder(time, reminderMessage, msg); // Pass the 'msg' object to the function
	} else if (msg.body.startsWith('!translate ')) {
		const targetLanguageAndText = msg.body.replace('!translate ', '').split('|');
		const targetLanguage = targetLanguageAndText[0].trim();
		const textToTranslate = targetLanguageAndText[1].trim();

		try {
			const translatedText = await translate(textToTranslate, {
				to: targetLanguage,
			});
			await msg.reply(`Translated (${targetLanguage}): ${translatedText}`);
		} catch (error) {
			await msg.reply('Error occurred while translating. Please try again.');
		}
	}
	else if (msg.body === '!fortune') {
		// Send a random fortune or funny/savage response
		const randomResponse = Math.random() < 0.5 // 50% chance of sending funny fortune
			? getRandomFortune()
			: getSavageResponse();

		if (randomResponse) {
			await msg.reply(`🔮 Fortune Teller says: ${randomResponse}`);
		} else {
			await msg.reply("🔮 The Fortune Teller is currently unavailable. Please try again later.");
		}
	}
	else if (msg.body === '!joke') {
		// Fetch a random Dad Joke from the API
		try {
			const jokeResponse = await axios.get('https://icanhazdadjoke.com/', {
				headers: {
					Accept: 'application/json',
				},
			});

			if (jokeResponse.data && jokeResponse.data.joke) {
				await msg.reply(`👨‍👧 Joke: ${jokeResponse.data.joke}`);
			} else {
				await msg.reply("👨‍👧 I'm sorry, I couldn't fetch a A Joke at the moment. Please try again later.");
			}
		} catch (error) {
			console.error('Error fetching Dad Joke:', error);
			await msg.reply("👨‍👧 Oops! There was an error while fetching the Dad Joke. Please try again later.");
		}
	} else if (msg.body.startsWith('!addbirthday ')) {
		if (chat.isGroup) {
			const participants = await chat.participants;
			const isAdmin = participants.some(participant => participant.isAdmin && participant.id._serialized === msg.author);

			if (isAdmin) {
				const parameters = msg.body.split(' ');
				if (parameters.length >= 4) {
					const name = parameters[1];
					const date = parseInt(parameters[2]);
					const month = parseInt(parameters[3]);

					const birthdayKey = `${date}-${month}`;

					if (!birthdaysData[chat.id._serialized]) {
						birthdaysData[chat.id._serialized] = {};
						updateBirthdayGroupIds(); // Update the group IDs array
					}

					if (!birthdaysData[chat.id._serialized][birthdayKey]) {
						birthdaysData[chat.id._serialized][birthdayKey] = [];
					}

					birthdaysData[chat.id._serialized][birthdayKey].push(name);
					saveBirthdaysData();

					await chat.sendMessage(`🎂 Birthday added! ${name}'s birthday has been set to ${date}-${month}.`);
				} else {
					await chat.sendMessage('⚠️ Please provide the name, date, and month in the format: !addbirthday [name] [date] [month]');
				}
			} else {
				await chat.sendMessage("⚠️ Only the group admin can add birthdays.");
			}
		} else {
			await chat.sendMessage("⚠️ This command can only be used in a group.");
		}
	}
	else if (msg.body === '!riddle') {
		const riddle = await getRandomRiddle();
		const attempts = 3;

		const message = `
	🤔 Riddle Challenge (${riddle.category}):
	${riddle.question}
	
	You have ${attempts} attempts to guess the answer. Reply with !answer [your_answer].
		`;

		chat.sendMessage(message);
		riddleSessions.set(chat.id._serialized, { riddle, attempts });
	} else if (msg.body.toLowerCase().startsWith('!answer')) {
		const answer = msg.body.split(' ')[1];
		checkRiddleAnswer(chat, answer);
	}
	else if (msg.body === '!rapidfire') {
		startRapidFire(chat, senderId);
	} else if (msg.body.toLowerCase().startsWith('!rfanswer')) {
		checkRapidFireAnswer(chat, msg);
	} else if (msg.body === '!endrapidfire') {
		endRapidFire(chat, senderId);
	}
	else if (msg.body === '!help') {
		const helpMessage = `🤖 *Bot Help Menu* 🤖\n\n` +
			`🔸 *!ping*: Check if the bot is active and responsive.\n` +
			`🔸 *!remindme [time] [optional date] | [message]*: Set a reminder for a specific time and an optional date. (e.g., !remindme 08:00 | Meeting at 9am)\n` +
			`🔸 *!translate [language code] | [text]*: Translate text to the specified language. (e.g., !translate es | Hello)\n` +
			`🔸 *!fortune*: Get a random fortune or a savage response from the Fortune Teller.\n` +
			`🔸 *!joke*: Get a random Dad Joke from the hilarious Dad Joke collection.\n` +
			`🔸 *!addbirthday* [name] [date] [month] - Add a member's birthday to the birthday wisher list. Example: !addbirthday John 15 8 (15th August).\n` +
			`🔸 *!rapidfire* - Start the Rapid Fire Questions game (group chat only) . \n` +
			`🔸 *!rfanswer* [your_answer] - Answer the current Rapid Fire question . \n` +
			`🔸 *!riddle*: Get a random riddle to solve. \n` +
			`🔸 *!answer* <your_answer>*: Submit your answer to the current riddle. \n` +
			`🔸 *@botname* <your_message>*: Chat with the bot using AI(OpenAI). (Mention the bot using its name)\n` +
			`🔸 *!help*: Display this help menu.\n\n` +
			`Enjoy interacting with the bot! 🔮`;

		await msg.reply(helpMessage);
	}
	else if (msg.body.includes('@919144902571')) {
		var messegenotmen = msg.body;
		console.log("the Bot is Mentioned")
		console.log(msg.mentionedIds)
		msg.mentionedIds.forEach((mention) => {
			var mennn = "@" + mention.replace("@c.us", "");
			messegenotmen = messegenotmen.replace(mennn, "").trim();
		})
		console.log(messegenotmen)
		handleAIChat(chat, messegenotmen);

	} else if (body.startsWith('!say')) {
		// handleTextToSpeech(chat, body);
		await msg.reply("This command is under development")
	}
	//  else {
	// 	// For other messages, enable AI chat functionality when the bot is mentioned
	// 	// handleAIChat(chat, body);
	// 	for(let contact of mentions) {
	// 		console.log(msg.body)
	// 	}
	// }
});


client.initialize();

const rapidFireSessions = new Map();

function scheduleReminder(time, message, msg) {
	const now = new Date();
	const [hours, minutes] = time.split(':');

	const scheduledTime = new Date();
	scheduledTime.setHours(hours);
	scheduledTime.setMinutes(minutes);

	if (scheduledTime < now) {
		// If the provided time is earlier than the current time, set it for the same time on the next day
		scheduledTime.setDate(now.getDate() + 1);
	}

	const job = schedule.scheduleJob(scheduledTime, () => {
		client.sendMessage(msg.from, `⏰ Reminder: ${message}`);
	});
	reminders.push(job);
}



function getRandomFortune() {
	// Array of funny fortunes
	const fortunes = [
		"You will find a pot of gold at the end of the rainbow!",
		"A great adventure awaits you in the near future!",
		"Your kindness will be rewarded in unexpected ways!",
		"A big surprise is coming your way!",
		"You will have a day filled with laughter and joy!",
		"Your creativity will lead you to new opportunities!",
		"Happiness will find you even in the smallest moments!",
		"A new friendship will brighten your life!",
		"An exciting journey is on the horizon!",
		"You will soon receive a message that will make you smile!",
	];

	return fortunes.length > 0 ? fortunes[Math.floor(Math.random() * fortunes.length)] : undefined;
}

function getSavageResponse() {
	// Array of savage responses
	const savageResponses = [
		"Yeah, right. Keep dreaming!",
		"Maybe. But probably not.",
		"The stars say 'nope'!",
		"Fortune Teller error: 404 Fortune not found.",
		"Outlook not so good. 🙃",
		"The fortune cookie is broken!",
		"The universe says 'meh'.",
		"You're destined to step on a Lego today.",
		"I wouldn't bet on it.",
		"My sources say 'as if.'",
		"If ignorance is bliss, you must be the happiest person alive.",
		"Some people bring happiness wherever they go; you bring happiness whenever you go.",
		"Roses are red, violets are blue, I thought I was ugly, but then I saw you.",
		"You must have been born on a highway because that's where most accidents happen.",
		"The only way you'll ever get laid is if you crawl up a chicken's ass and wait.",
		"You're not stupid; you just have bad luck thinking.",
		"If I wanted to kill myself, I would climb your ego and jump to your IQ.",
		"I would agree with you, but then we would both be wrong.",
		"You're about as useful as a screen door on a submarine.",
		"I'm not saying I hate you, but I would unplug your life support to charge my phone.",
		"Do yourself a favor and ignore anyone who tells you to be yourself.",
		"You're the reason God created the middle finger.",
		"I'm sorry, was I meant to be offended? The only thing offending me is your face.",
		"If I had a face like yours, I'd sue my parents.",
		"You bring everyone a lot of joy, when you leave the room.",
		"If you were any less intelligent, we'd have to water you.",
		"When you were born, the doctor threw you out the window and the window threw you back.",
		"I'd explain it to you, but I don't have any crayons.",
		"You must have a low opinion of people if you think they're your equals.",
		"I'd challenge you to a battle of wits, but I see you're unarmed.",
		"It's okay if you don't like me, not everyone has good taste.",
		"I'm not insulting you, I'm describing you.",
		"Keep rolling your eyes, maybe you'll find a brain back there.",
		"You're not stupid; you just have bad luck thinking.",
		"You're not pretty enough to be that dumb.",
		"The only way you'll ever get laid is if you crawl up a chicken's ass and wait.",
		"You bring everyone a lot of joy, when you leave the room.",
		"If you were any less intelligent, we'd have to water you.",
		"When you were born, the doctor threw you out the window and the window threw you back.",
		"I'd explain it to you, but I don't have any crayons.",
		"You must have a low opinion of people if you think they're your equals.",
		"I'd challenge you to a battle of wits, but I see you're unarmed.",
		"It's okay if you don't like me, not everyone has good taste.",
		"I'm not insulting you, I'm describing you.",
		"Keep rolling your eyes, maybe you'll find a brain back there.",
		"You're not pretty enough to be that dumb.",
		"Is your ass jealous of the amount of shit that just came out of your mouth?",
		"You must have a very low opinion of yourself if you think I care what you say.",
		"I'm sorry, I don't speak idiot.",
		"If you were any dumber, we'd have to water you twice a week.",
		"I don't have the time or the crayons to explain this to you.",
		"I'm not saying you're stupid; you just have bad luck thinking.",
		"The last time I saw something like you, I flushed it.",
		"I envy people who have never met you.",
		"It's not that I dislike you; I just don't like anything about you.",
		"Your IQ doesn't make a respectable earthquake.",
		"If your brain was dynamite, there wouldn't be enough to blow your hat off.",
		"I hope your day is as pleasant as you are.",
		"I'm not insulting you; I'm describing you.",
		"You're not stupid; you just have bad luck thinking.",
		"You're not pretty enough to be that dumb.",
		"Is your ass jealous of the amount of shit that just came out of your mouth?",
		"You must have a very low opinion of yourself if you think I care what you say.",
		"I'm sorry, I don't speak idiot.",
		"If you were any dumber, we'd have to water you twice a week.",
		"I don't have the time or the crayons to explain this to you.",
		"I'm not saying you're stupid; you just have bad luck thinking.",
		"The last time I saw something like you, I flushed it.",
		"I envy people who have never met you.",
		"It's not that I dislike you; I just don't like anything about you.",
		"Your IQ doesn't make a respectable earthquake.",
		"If your brain was dynamite, there wouldn't be enough to blow your hat off.",
		"I hope your day is as pleasant as you are.",
		"I'd slap you, but that would be animal abuse.",
		"You're like a hemorrhoid, a pain in the ass that just won't go away.",
		"It's impressive how you've lived this long without a brain.",
		"I'd agree with you, but then we'd both be wrong.",
		"You're not pretty enough to be this dumb.",
		"You're about as useful as a screen door on a submarine.",
		"I'd call you a tool, but even they serve a purpose.",
		"If I wanted a bitch, I would have bought a dog.",
		"I'm not saying you're stupid; you just have bad luck thinking.",
		"You're not stupid; you just have bad luck thinking.",
		"You're not pretty enough to be that dumb."
	];

	return savageResponses.length > 0 ? savageResponses[Math.floor(Math.random() * savageResponses.length)] : undefined;
}

async function sendBirthdayWishes() {
	const now = new Date();
	const todayKey = `${now.getDate()}-${now.getMonth() + 1}`;

	for (const groupId of birthdayGroupIds) {
		const groupData = birthdaysData[groupId];
		const groupName = groupsData[groupId];

		if (groupData) {
			for (const birthdayKey in groupData) {
				if (birthdayKey === todayKey) {
					const names = groupData[birthdayKey];
					names.forEach((e) => {
						const message = `🎉 Happy Birthday to ${e}! 🎂🎈🎉\nMay your day be filled with joy and laughter! 🥳`;

						// Fetch the group chat by group ID
						const chatId = groupId;

						// Send birthday wishes
						client.sendMessage(chatId, message).then(() => {
							console.log(`Birthday wishes sent to ${e} in group ${groupName}.`);
						}).catch((error) => {
							console.error('Error sending birthday wishes:', error);
						});
					})
				}
			}
		}
	}
}

async function getRandomRiddle() {
	try {
		const response = await axios.get(JSERVICE_API_URL);
		const riddleData = response.data[0];
		const category = riddleData?.category?.title || 'Unknown Category';
		const question = riddleData?.question || 'Could not fetch riddle.';
		const answer = riddleData?.answer || 'Could not fetch answer.';

		return { category, question, answer };
	} catch (error) {
		console.error('Error fetching riddle:', error.message);
		return {
			category: 'Unknown Category',
			question: 'Could not fetch riddle.',
			answer: 'Could not fetch answer.',
		};
	}
}

const riddleSessions = new Map();

Client.prototype.sendRiddle = async function (attempts) {
	const chat = this;

	try {
		const riddle = await getRandomRiddle();
		const message = `
  🤔 Riddle Challenge (${riddle.category}):\n\n

  ${riddle.question}\n\n
  
  You have ${attempts} attempts to guess the answer. Reply with !answer [your_answer].
	  `;

		chat.sendMessage(message);
		riddleSessions.set(chat.id._serialized, { riddle, attempts });
	} catch (error) {
		console.error('Error sending riddle:', error.message);
		chat.sendMessage('⚠️ Error fetching riddle. Please try again later.');
	}
};

function checkRiddleAnswer(chat, answer) {
	const session = riddleSessions.get(chat.id._serialized);

	if (!session) {
		chat.sendMessage("⚠️ There's no ongoing riddle challenge in this chat.");
		return;
	}

	if (session.attempts <= 0) {
		chat.sendMessage(`⌛ Time's up! The correct answer is: ${session.riddle.answer}`);
		riddleSessions.delete(chat.id._serialized);
		return;
	}

	if (answer.toLowerCase() === session.riddle.answer.toLowerCase()) {
		chat.sendMessage(`🎉 Correct! You've solved the riddle: ${session.riddle.answer}`);
		riddleSessions.delete(chat.id._serialized);
		return;
	} else {
		session.attempts--;
		if (session.attempts > 0) {
			chat.sendMessage(`❌ Incorrect! You have ${session.attempts} attempts left.`);
		} else {
			chat.sendMessage(`❌ Incorrect! The correct answer is: ${session.riddle.answer}`);
			riddleSessions.delete(chat.id._serialized);
		}
	}
}


function generateTriviaQuestions(count = 5) {
	// Generate trivia questions by fetching them from the API
	const apiUrl = `https://opentdb.com/api.php?amount=5&difficulty=medium&type=multiple`;

	return axios.get(apiUrl)
		.then((response) => {
			console.log(response.data)
			if (response.data.results) {
				return response.data.results.map((result) => {
					const questionText = result.question;
					const correctAnswer = result.correct_answer;
					const incorrectAnswers = result.incorrect_answers;
					const allAnswers = [correctAnswer, ...incorrectAnswers];

					return {
						questionText: questionText,
						allAnswers: allAnswers,
						answer: correctAnswer,
					};
				});
			} else {
				throw new Error('Failed to fetch trivia questions from the API.');
			}
		})
		.catch((error) => {
			console.error('Error fetching trivia questions:', error.message);
			throw error;
		});
}

async function askNextQuestion(chat) {
	const session = rapidFireSessions.get(chat.id._serialized);

	if (!session || session.questions.length === 0 || session.currentQuestionIndex >= session.questions.length - 1) {
		endRapidFire(chat);
		return;
	}

	session.currentQuestionIndex++;
	const currentQuestion = session.questions[session.currentQuestionIndex];

	const message = `
  🔫 Rapid Fire Question ${session.currentQuestionIndex + 1}:\n\n


  ${currentQuestion.questionText}\n\n


  You have ${QUESTION_TIMEOUT / 1000} seconds to answer. Reply with '!rfanswer [your_answer]'.
	`;

	chat.sendMessage(message);

	// Set a timer to reveal the answer after the timeout
	session.timer = setTimeout(() => {
		session.timer = null;
		revealAnswer(chat, currentQuestion);
	}, QUESTION_TIMEOUT);
}

async function revealAnswer(chat, question) {
	if (!question) {
		return;
	}

	chat.sendMessage(`⏰ Time's up! The correct answer is: ${question.answer}`);
	// Continue to the next question or end the game
	askNextQuestion(chat);
}

function isGroupChat(chat) {
	return chat.isGroup;
}

async function startRapidFire(chat, count = 5) {
	if (!isGroupChat(chat)) {
		chat.sendMessage("⚠️ Rapid Fire Questions game can only be played in group chats.");
		return;
	}

	if (rapidFireSessions.has(chat.id._serialized)) {
		chat.sendMessage("⚠️ Rapid Fire Questions game is already in progress in this chat.");
		return;
	}

	try {
		const questions = await generateTriviaQuestions(count);

		if (questions.length === 0) {
			chat.sendMessage("❌ Failed to fetch trivia questions from the API.");
			console.error('No trivia questions fetched from the API.');
			return;
		}

		rapidFireSessions.set(chat.id._serialized, {
			questions: questions,
			currentQuestionIndex: -1,
			timer: null,
		});

		askNextQuestion(chat);
	} catch (error) {
		chat.sendMessage("❌ Failed to start Rapid Fire Questions game.");
		console.error('Error starting Rapid Fire Questions game:', error.message);
	}
}

async function endRapidFire(chat) {
	if (!rapidFireSessions.has(chat.id._serialized)) {
		chat.sendMessage("⚠️ Rapid Fire Questions game is not in progress in this chat.");
		return;
	}

	rapidFireSessions.delete(chat.id._serialized);
	chat.sendMessage("🛑 Rapid Fire Questions game has ended.");
}

async function checkRapidFireAnswer(chat, msg) {
	const session = rapidFireSessions.get(chat.id._serialized);

	if (!session) {
		chat.sendMessage("⚠️ Rapid Fire Questions game is not in progress in this chat.");
		return;
	}

	const currentQuestion = session.questions[session.currentQuestionIndex];

	if (!currentQuestion || !session.timer) {
		// No ongoing question or the timer has expired
		return;
	}

	clearTimeout(session.timer);
	session.timer = null;

	const answer = msg.body.split(' ').slice(1).join(' '); // Get the full answer including spaces

	if (answer.toLowerCase() === currentQuestion.answer.toLowerCase()) {
		chat.sendMessage(`🎉 That's correct! Your answer: ${answer}`);
		// Continue to the next question or end the game
		askNextQuestion(chat);
	} else {
		chat.sendMessage(`😕 That's incorrect. Your answer: ${answer}. Keep trying!`);
		// Set a timer to reveal the answer after the default timeout
		session.timer = setTimeout(() => {
			session.timer = null;
			revealAnswer(chat, currentQuestion);
		}, QUESTION_TIMEOUT); // Delayed reveal after the default timeout
	}
}

async function callOpenAIChatAPI(message) {
	try {
		const chatCompletion = await openai.createChatCompletion({
			model: "gpt-3.5-turbo",
			messages: [{ role: "user", content: message }],
		});
		console.log(chatCompletion.data.choices[0].message)
		return chatCompletion.data.choices[0].message.content;
	} catch (error) {
		console.error('Error calling OpenAI API:', error.message);
		return 'Sorry, I am having trouble processing your request at the moment.';
	}
}

async function handleAIChat(chat, message) {
	const reply = await callOpenAIChatAPI(message);

	console.log("chat returned")

	chat.sendMessage(reply);
}

async function handleTextToSpeech(chat, message) {
	const textToSpeechMessage = message.substring(5).trim(); // Remove the '!say' command from the message
  
	try {
	  // Create a new GTTS instance
	  const tts = new gtts(textToSpeechMessage, 'en');
	  var timestamp = new Date().getUTCMilliseconds().toString()
	  var filepath = `./${timestamp}.mp3`
	  tts.save(filepath, function (err, result) {
		if(err) { console.log(err) }
	  });
	  const base64String = mp3ToBase64(filepath);
	  const media = new MessageMedia('audio/mpeg', base64String);
	  chat.sendMessage(media)
	  fs.unlink(filepath,(err)=>{
		if(err){
			console.log(err)
		}
	  })
	} catch (error) {
	  console.error('Error converting text to speech:', error.message);
	  chat.sendMessage('Sorry, I am having trouble converting the text to speech at the moment.');
	}
  }


  function mp3ToBase64(filePath) {
	try {
	  // Read the MP3 file as a buffer
	  const mp3Buffer = fs.readFileSync(filePath);
  
	  // Convert the buffer to a base64 string
	  const base64String = mp3Buffer.toString('base64');
  
	  return base64String;
	} catch (err) {
	  console.error('Error converting MP3 to base64:', err);
	  return null;
	}
  }