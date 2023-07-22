const { Client } = require("whatsapp-web.js");

class Whatsapp {
    constructor(){
        this.client = new Client;
    }

    initialize(){
        this.client.initialize();
    }
}