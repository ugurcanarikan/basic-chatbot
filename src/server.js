const express = require('express');
const path = require('path');
const rp = require('request-promise');
const fs = require('fs');
const request = require('request');
const MongoClient = require('mongodb').MongoClient;


const readXlsxFile = require('../node_modules/read-excel-file/node');
const multer  = require('multer');
const UPLOAD_DESTINATION = __dirname + "/uploads/";
const OLD_TRAINING_PATH = __dirname + "/rasa/default_training.yml";
var upload = multer({ dest: UPLOAD_DESTINATION });

const app = express();
const port = process.env.port || 3001;


app.listen(port, () => {
    console.log("Starting initial training");
    initialTraining().then(() => {
        console.log("Server listenning on port " + port);
    }).catch(err => {
        console.error(err);
    });
});

app.get('/response/*', async (req, res) => {
    var paramArray = req.params[0].split('&');
    var message = paramArray[0];
    var flowValue = paramArray[1];
    var flowLenght = parseInt(paramArray[2]);
    var endOfFlow = true;
    console.log("Incoming message : " + message);
    console.log("Incoming flow value : " + flowValue);
    console.log("Incoming flow length : " + flowLenght);
    var flow = {value : ""};
    await getFlow(message, flow);
    var response = "";
    if(flowValue === "currency"){
        var currency = {eur : "", usd : "", code : 0};
        await getCurrency(currency);
        if(currency.code === 200){
            response = "EUR/TL = " + currency.eur + " \n " + 
                      "USD/TL = " + currency.usd + " \n " ;
        }
        else if(currency.code === 404){
            response = "Error while getting the currency exchange rates";
        }
    }
    else if(flowValue === "weather"){
        if(flowLenght === 1){
            response = "Which city would you like to know?";
            endOfFlow = false;
        }
        else if(flowLenght === 2){
            var url = await getCityUrl(message);
            var weather = {city: message, code: 0};
            await getWeather(url, weather);
            if(weather.code === 200){
                response = "Weather in " + weather.city + " is " + weather.main + " with " +
                    weather.description + ". \nTemperature is " + weather.temp + 
                    "Celcius. \n" + "Humidity is " + weather.humidity + " % . \n" + 
                    "Pressure is " + weather.pressure + " bar";
            }
            else if(weather.code === 404){
                response = "Error while getting the weather for " + message;
            }
        }
    }
    else if(flowValue === "affirm"){
        response = "Thanks";
    }
    else if(flowValue === "greet"){
        response = "Hi";
    }
    else if(flowValue === "thank"){
        response = "You are welcome";
    }
    else if(flowValue === "smalltalk"){
        response = "I'm fine, thanks";
    }
    else if(flowValue === "goodbye"){
        response = "goodbye"
    }
    else if(flowValue === "frustration"){
        response = "I am sorry I couldn't be more helpful"
    }
    else if(flowValue === "insult"){
        response = "That is not a nice thing to say";
    }
    else if(flowValue !== null){
        response = flowValue;
    }
    else{
        response = "Cannot understand your message";
    }
    console.log("Determined response: " + response);
    console.log("End of flow: " + endOfFlow);
    console.log("************");
    res.send({response : response, endOfFlow: endOfFlow});
})

app.get('/flow/*', async (req, res) => {
    var message = req.params[0];
    console.log("Incoming message : " + message);
    var flow = {value : null};
    await getFlow(message, flow);
    res.send({flow : flow.value});
})

app.post('/upload/',upload.single('file'), async (req, res) => {
    var file = {};
    await readExcel(file, UPLOAD_DESTINATION + "/" + req.file.filename).then(async () => {
        await trainWithFile(file).then(response => res.send(response));
    })
})

app.post('/uploadd/',upload.single('file'), async (req, res) => {
    var file = {};
    var ret = {};
    await readExcel(file, UPLOAD_DESTINATION + "/" + req.file.filename).then(async () => {
        var url = "mongodb://vca:Abc1234!@ds135952.mlab.com:35952/nlu";
        console.log("Connecting to the database at " + url);
        MongoClient.connect(url, function(err, db) {
        if (err){console.error(err)};
        var dbo = db.db("nlu"); 
        new Promise((resolve, reject) => {
            dbo.collection("Intents").insertMany(Object.values(file), function(err, res) {
                if (err){
                    reject(err);
                }
                else{ 
                    console.log("New intents have been inserted to the database");
                    resolve(dbo);
                }
            })}).then(async dbo => {
                var ret = {};
                await dbo.collection("Intents").find({}, { projection: { _id: 0 } }).toArray()
            .then(result => {
                var fileContents = "language: \"en\" \n\n";
                    fileContents = fileContents + "pipeline: \"spacy_sklearn\"\n\n" ;
                    fileContents = fileContents + "data: {\n  \"rasa_nlu_data\": {\n    \"common_examples\": [\n";
                    for(let i = 0; i < result.length; i++){
                        fileContents = fileContents + "      {\n        \"text\": \"" + result[i].text + "\",\n";
                        fileContents = fileContents + "        \"intent\": \"" + result[i].intent + "\"\n      },\n";
                    }
                    fileContents = fileContents + "    ]\n   }\n}";
                    fileContents = encode_utf8(fileContents);
                    console.log("Training file ready");
                    console.log(fileContents);
                    ret = {text: fileContents};
                    return new Promise((resolve, reject) => {resolve(ret)});
            }).then(async s => {
                console.log("Making train request to localhost:5000");
                await trainNLU(s).then(response => {
                    if(response.statusCode === 200){
                        console.log("SUCCESS TRAINING");
                    }
                    else{
                        console.error("FAILED TRAINING");
                    }
                    res.send({statusCode: response.statusCode});
                    }).catch(err => {
                        console.error(err);
                    });
            }).catch(err => {
                console.error(err);
                reject(err);
            }); 
        })});
    }).catch(err => {
        console.error(err);
    })
})

/**
 * Trains the nlu unit given the contents of the file
 * @param {*} file contents that the nlu will be trained with
 */
async function trainWithFile(file){
    res = {};
    var fileContents = "language: \"en\" \n\n";
    fileContents = fileContents + "pipeline: \"spacy_sklearn\"\n\n" ;
    fileContents = fileContents + "data: {\n  \"rasa_nlu_data\": {\n    \"common_examples\": [\n";
    await new Promise((resolve, reject) => {
        fs.readFile(OLD_TRAINING_PATH, "utf8", (err, data) => {
            if(err) reject(err);
            else{
                resolve(data);
            }
        });
    }).then(data => {
        fileContents = fileContents + data;
        fileContents = encode_utf8(fileContents);
    }).then(() => {
        var length = Object.keys(file).length;
        for(i = 0; i < length; i++){
            var newIntent = "      {\n  " + "        \"text\": \"" + file[i].text + "\",\n  " + "        \"intent\": \"" + file[i].intent + "\",\n  " + "        \"entities\": []\n        },\n  ";
            fileContents = fileContents + newIntent;
            fs.appendFile(OLD_TRAINING_PATH, newIntent, err => {
                if(err) console.error(err);
            });
        };
        fileContents = fileContents + "    ]\n   }\n}";
        fileContents = encode_utf8(fileContents);
        console.log("Training file ready");
        return {text: fileContents};
    }).then(async s => {
        console.log("Making train request to localhost:5000");
        await trainNLU(s).then(response => {
            if(response.statusCode === 200){
                console.log("SUCCESS TRAINING");
            }
            else{
                console.error("FAILED TRAINING");
            }
            res = {statusCode: response.statusCode};
            }).catch(err => {
                console.error(err);
            });
    }).catch(err => {
        console.error(err);
        reject(err);
    }); 
    return res;
}

/**
 * Starts the initial training of the nlu each time chatbot has started
 */
async function initialTraining(){
    var fileContents = "language: \"en\" \n\n";
    fileContents = fileContents + "pipeline: \"spacy_sklearn\"\n\n" ;
    fileContents = fileContents + "data: {\n  \"rasa_nlu_data\": {\n    \"common_examples\": [\n";
    new Promise((resolve, reject) => {
        fs.readFile(OLD_TRAINING_PATH, "utf8", (err, data) => {
            if(err){
                reject(err);
            }
            else{
                resolve(data);
            }
        });
    }).then(data => {
        fileContents = fileContents + data;
        fileContents = fileContents + "    ]\n   }\n}";
        fileContents = encode_utf8(fileContents);
        console.log("Training file ready");
        return {text: fileContents};
    }).then(async s => {
        console.log("Making train request to localhost:5000");
        await trainNLU(s).then(response => {
            if(response.statusCode === 200){
                console.log("SUCCESS INITIAL TRAINING");
            }
            else{
                console.error("FAILED INITIAL TRAINING");
            }
            }).catch(err => {
                console.error(err);
            });
    }).catch(err => {
        console.error(err);
        reject(err);
    }); 
}

/**
 * Makes the request that trains the nlu given the training file
 * @param {*} file file that holds the contents that the nlu will be trained
 */
async function trainNLU(file){
    file.text = encode_utf8(file.text);
    var res = {};
    var options = { 
        method: 'POST',
        url: 'http://localhost:5000/train?project=current&model=nlu2',
        qs: { project: 'current' },
        headers: 
        { 
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/x-yml' },
        body: file.text,
        resolveWithFullResponse: true
    };
    console.log("Awaiting response from localhost:5000/train");
    await rp(options).then(response => {
        console.log(response.body);
        res = response;
        return response;
    }).catch(err => {
        console.error(err);
    })
    return res;
}

/**
 * Determines the flow of the given message
 * @param {*} message message of the user
 * @param {*} flow object to hold the determined flow
 */
async function getFlow(message, flow){
    console.log("Determining the flow of the message");
    await askNLU(message, flow);
    console.log("Determined Flow : " + flow.value);
}

/**
 * Determines the url of the weather stats of the given city
 * @param {*} message message of the user which is expected to be a city
 */
function getCityUrl(message) {
    var city = message.charAt(0).toUpperCase() + message.slice(1);
    city = city.replace(/\s+/g, '');
    var url = 'http://api.openweathermap.org/data/2.5/weather?q=' + city +
        '&appid=' + 'd46ce5a0f44a100b614bde2f94a11c15';

    return url;
}

/**
 * Makes a request to the given url and holds the resulting weather stats in weather object
 * @param {*} url url to make the request
 * @param {*} weather object to hold the weather stats
 */
async function getWeather(url, weather) {
    console.log("Connecting to " + url + " to get the weather");
    await rp(url).then(body => {
        var b = JSON.parse(body);
        weather.code = 200;
        weather.main = b.weather[0].main;
        weather.description = b.weather[0].description;
        weather.temp = b.main.temp - 273.15;
        weather.humidity = b.main.humidity;
        weather.pressure = b.main.pressure;
    }).catch((err) => {
        weather.code = 404;
        console.error("Error getting the weather in the getWeather function in customActions.js")
        console.error(err);
    });
}

function getDateTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;
}

function getDate() {
    var date = new Date();
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    day = day - 1;
    return year + "-" + month + "-" + day;
}

/**
 * Determines the current currency rates making requests
 * @param {*} currency to hold the currency rates
 */
async function getCurrency(currency) {
    var url = "http://free.currencyconverterapi.com/api/v5/convert?q=EUR_TRY&compact=y";
    console.log("Connecting to " + url + " to get EUR exchange rates");
    await rp(url).then(body => {
        var b = JSON.parse(body);
        return b;
    }).then(b => {
        currency.code = 200;
        currency.eur = b.EUR_TRY.val;
        console.log("1 euro = " + currency.eur);
    }).catch(err => {
        currency.code = 404;
        console.error(err);
    });
    var url2 = "http://free.currencyconverterapi.com/api/v5/convert?q=USD_TRY&compact=y";
    console.log("Connecting to " + url2 + " to get USD exchange rates");
    await rp(url2).then(body => {
        var b = JSON.parse(body);
        return b;
    }).then(b => {
        currency.code = 200;
        currency.usd = b.USD_TRY.val;
        console.log("1 dollar = " + currency.usd);
    }).catch(err => {
        currency.code = 404;
        console.error(err);
    });
}

/**
 * Determines the flow of the given message asking NLU unit at port 5000 by making a POST request
 * @param {*} message input message
 * @param {*} flow object to hold the determined flow 
 */
async function askNLU(message, flow) {
    var dataString = "{\"q\": \"" + message + "\", \"project\": \"current\", \"model\": \"nlu2\"}";

    console.log(dataString);
    var options = {
        url: 'http://localhost:5000/parse',
        method: 'POST',
        body: dataString,
        //resolveWithFullResponse: true
    };
    await rp(options).then(body => {
        var b = JSON.parse(body);
        console.log(b);
        return b;
    }).then(b => {
        if (b.intent.confidence >= 0.25) {
            flow.value = b.intent.name;
        }
    }).catch(err => {
        console.error(err);
    });
}

/**
 * Reads an excel file in the .xlsx format. File's location is given in the function
 * Excel file is then transformed to an array of q/a objects
 * Excel file is assumed to have below format:
 * row1:    [file header]
 * row2:    [row of field names]
 * row3:    [rows of fields]
 * Example:
 *          faq
 *          questions | answers
 *          q1        | a1
 *          q2        | a2 
 * output: {0:{questions:q1, answers:a1}, {questions:q2, answers:a2}]
 * @param {*} file file to hold the resulting array of objects
 * @param {*} location path of the xlsx file
 */
async function readExcel(file, location){
    await readXlsxFile(location).then((rows) => {
        var numOfFields = rows[1].length;
        for(let i = 0; i < rows.length - 2; i++){
            file[i] = {};
        }
        for(let i = 2; i < rows.length; i++){
            for(let j = 0; j < numOfFields; j++){
                if(j == 0)
                    file[i - 2]["text"] = rows[i][j];
                else 
                    file[i - 2]["intent"] = rows[i][j];
            }
        }
        }).catch(err => {
            console.error("Error reading excel file: " + err);
    })
}

function encode_utf8( s ){
    return unescape( encodeURIComponent( s ) );
}( '\u4e0a\u6d77' )

function readTextFile(file, s){
    var rawFile = new XMLHttpRequest();
    rawFile.open("GET", file, false);
    rawFile.onreadystatechange = function ()
    {
        if(rawFile.readyState === 4)
        {
            if(rawFile.status === 200 || rawFile.status == 0)
            {
                var allText = rawFile.responseText;
                s.text = allText;
            }
        }
    }
    rawFile.send(null);
}
function readFile(filePath, s){
    fs.readFile(filePath, {encoding: 'utf-8'}, function(err,data){
        if (!err) {
            console.log('Received data: ' + data);
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.write(data);
            response.end();
        } else {
            console.error(err);
        }
    });
}


const array1 = [        {
    text: "yes", 
    intent: "affirm",
  }, 
  {
    text: "yep", 
    intent: "affirm",
  }, 
  {
    text: "yeah", 
    intent: "affirm",
  }, 
  {
    text: "indeed", 
    intent: "affirm",
  }, 
  {
    text: "that's right", 
    intent: "affirm",
  }, 
  {
    text: "ok", 
    intent: "affirm",
  }, 
  {
    text: "great", 
    intent: "affirm",
  }, 
  {
    text: "right, thank you", 
    intent: "affirm",
  }, 
  {
    text: "correct", 
    intent: "affirm",
  }, 
  {
    text: "great choice", 
    intent: "affirm",
  }, 
  {
    text: "sounds really good", 
    intent: "affirm",
  }, 
  {
    text: "right", 
    intent: "affirm",
  }, 
  {
    text: "affirmative", 
    intent: "affirm",
  }, 
  {
    text: "roger that", 
    intent: "affirm",
  }, 
  {
    text: "agreed", 
    intent: "affirm",
  }, 
  {
    text: "alright", 
    intent: "affirm",
  }, 
  {
    text: "nice", 
    intent: "affirm",
  }, 
  {
    text: "bye", 
    intent: "goodbye",
  }, 
  {
    text: "goodbye", 
    intent: "goodbye",
  }, 
  {
    text: "good bye", 
    intent: "goodbye",
  }, 
  {
    text: "stop", 
    intent: "goodbye",
  }, 
  {
    text: "end", 
    intent: "goodbye",
  }, 
  {
    text: "farewell", 
    intent: "goodbye",
  }, 
  {
    text: "Bye bye", 
    intent: "goodbye",
  }, 
  {
    text: "have a good one", 
    intent: "goodbye",
  }, 
  {
    text: "see you", 
    intent: "goodbye",
  }, 
  {
    text: "later", 
    intent: "goodbye",
  }, 
  {
    text: "so long", 
    intent: "goodbye",
  }, 
  {
    text: "bye bye", 
    intent: "goodbye",
  }, 
  {
    text: "see you later", 
    intent: "goodbye",
  }, 
  {
    text: "have a nice day", 
    intent: "goodbye",
  }, 
  {
    text: "bye bye", 
    intent: "goodbye",
  }, 
  {
    text: "goodbye then", 
    intent: "goodbye",
  }, 
  {
    text: "later", 
    intent: "goodbye",
  }, 
  {
    text: "peace", 
    intent: "goodbye",
  }, 
  {
    text: "hey", 
    intent: "greet",
  }, 
  {
    text: "howdy", 
    intent: "greet",
  }, 
  {
    text: "hey there", 
    intent: "greet",
  }, 
  {
    text: "hello", 
    intent: "greet",
  }, 
  {
    text: "hi", 
    intent: "greet",
  }, 
  {
    text: "good morning", 
    intent: "greet",
  }, 
  {
    text: "good evening", 
    intent: "greet",
  }, 
  {
    text: "dear sir", 
    intent: "greet",
  }, 
  {
    text: "how are you", 
    intent: "smalltalk",
  }, 
  {
    text: "whatsup", 
    intent: "smalltalk",
  }, 
  {
    text: "sup", 
    intent: "smalltalk",
  }, 
  {
    text: "how do you feel", 
    intent: "smalltalk",
  }, 
  {
    text: "are you ok", 
    intent: "smalltalk",
  }, 
  {
    text: "how are you doing", 
    intent: "smalltalk",
  }, 
  {
    text: "how u doin", 
    intent: "smalltalk",
  }, 
  {
    text: "how is it going", 
    intent: "smalltalk",
  }, 
  {
    text: "are you all set", 
    intent: "smalltalk",
  }, 
  {
    text: "thanks", 
    intent: "thank",
  }, 
  {
    text: "thank you", 
    intent: "thank",
  }, 
  {
    text: "thx", 
    intent: "thank",
  }, 
  {
    text: "thank you very much", 
    intent: "thank",
  }, 
  {
    text: "much appreciated", 
    intent: "thank",
  }, 
  {
    text: "appreciate that", 
    intent: "thank",
  }, 
  {
    text: "gratitude", 
    intent: "thank",
  }, 
  {
    text: "thanks a lot", 
    intent: "thank",
  }, 
  {
    text: "thank you very much", 
    intent: "thank",
  }, 
  {
    text: "thanks very much", 
    intent: "thank",
  }, 
  {
    text: "weather", 
    intent: "weather",
  }, 
  {
    text: "temperature", 
    intent: "weather",
  }, 
  {
    text: "rain", 
    intent: "weather",
  }, 
  {
    text: "rainy", 
    intent: "weather",
  }, 
  {
    text: "snow", 
    intent: "weather",
  }, 
  {
    text: "snowy", 
    intent: "weather",
  }, 
  {
    text: "wind", 
    intent: "weather",
  }, 
  {
    text: "windy", 
    intent: "weather",
  }, 
  {
    text: "temp", 
    intent: "weather",
  }, 
  {
    text: "sky", 
    intent: "weather",
  }, 
  {
    text: "forecast", 
    intent: "weather",
  }, 
  {
    text: "what is the weather", 
    intent: "weather",
  }, 
  {
    text: "how is the weather", 
    intent: "weather",
  }, 
  {
    text: "how hot it is", 
    intent: "weather",
  }, 
  {
    text: "is it going to rain", 
    intent: "weather",
  }, 
  {
    text: "forecast", 
    intent: "weather",
  }, 
  {
    text: "temp", 
    intent: "weather",
  }, 
  {
    text: "hot", 
    intent: "weather",
  }, 
  {
    text: "cold", 
    intent: "weather",
  }, 
  {
    text: "wet", 
    intent: "weather",
  }, 
  {
    text: "will it rain", 
    intent: "weather",
  }, 
  {
    text: "today's weather forecast", 
    intent: "weather",
  }, 
  {
    text: "money", 
    intent: "currency",
  }, 
  {
    text: "exchange", 
    intent: "currency",
  }, 
  {
    text: "rate", 
    intent: "currency",
  }, 
  {
    text: "dollar", 
    intent: "currency",
  }, 
  {
    text: "euro", 
    intent: "currency",
  }, 
  {
    text: "lira", 
    intent: "currency",
  }, 
  {
    text: "trade", 
    intent: "currency",
  }, 
  {
    text: "what is the dollar rate", 
    intent: "currency",
  }, 
  {
    text: "what is the euro rate", 
    intent: "currency",
  }, 
  {
    text: "how much lira one dollar is", 
    intent: "currency",
  }, 
  {
    text: "how much lira one euro is", 
    intent: "currency",
  }, 
  {
    text: "how much dollar", 
    intent: "currency",
  }, 
  {
    text: "how much euro", 
    intent: "currency",
  }, 
  {
    text: "how much lira", 
    intent: "currency",
  }, 
  {
    text: "exchange rates", 
    intent: "currency",
  }, 
  {
    text: "inflation", 
    intent: "currency",
  }, 
  {
    text: "loss", 
    intent: "currency",
  }, 
  {
    text: "gain", 
    intent: "currency",
  }, 
  {
    text: "bid", 
    intent: "currency",
  }, 
  {
    text: "openning bid", 
    intent: "currency",
  }, 
  {
    text: "closing bid", 
    intent: "currency",
  }, 
  {
    text: "average", 
    intent: "currency",
  }, 
  {
    text: "open", 
    intent: "currency",
  }, 
  {
    text: "close", 
    intent: "currency",
  }, 
  {
    text: "midpoint", 
    intent: "currency",
  }, 
  {
    text: "dollar rate", 
    intent: "currency",
  }, 
  {
    text: "euro rate", 
    intent: "currency",
  }, 
  {
    text: "dollar/tl", 
    intent: "currency",
  }, 
  {
    text: "euro/tl", 
    intent: "currency",
  }, 
  {
    text: "usd", 
    intent: "currency",
  }, 
  {
    text: "eur", 
    intent: "currency",
  }, 
  {
    text: "tl", 
    intent: "currency",
  }, 
  {
    text: "value", 
    intent: "currency",
  }, 
  {
    text: "currency", 
    intent: "currency",
  }, 
  {
    text: "american dollar", 
    intent: "currency",
  }, 
  {
    text: "try", 
    intent: "currency",
  }, 
  {
    text: "retard", 
    intent: "insult",
  }, 
  {
    text: "idiot", 
    intent: "insult",
  }, 
  {
    text: "moron", 
    intent: "insult",
  }, 
  {
    text: "stupid", 
    intent: "insult",
  }, 
  {
    text: "fuck you", 
    intent: "insult",
  }, 
  {
    text: "shit", 
    intent: "insult",
  }, 
  {
    text: "bitch", 
    intent: "insult",
  }, 
  {
    text: "fuck", 
    intent: "insult",
  }, 
  {
    text: "fucking", 
    intent: "insult",
  }, 
  {
    text: "stupid bot", 
    intent: "insult",
  }, 
  {
    text: "fucking moron", 
    intent: "insult",
  }, 
  {
    text: "fucking idiot", 
    intent: "insult",
  }, 
  {
    text: "fucking retard", 
    intent: "insult",
  }, 
  {
    text: "you moron", 
    intent: "insult",
  }, 
  {
    text: "stupid little shit", 
    intent: "insult",
  }, 
  {
    text: "useless bot", 
    intent: "insult",
  }, 
  {
    text: "waste of time", 
    intent: "insult",
  }, 
  {
    text: "dirty", 
    intent: "insult",
  }, 
  {
    text: "imbecile", 
    intent: "insult",
  }, 
  {
    text: "go fuck yourself", 
    intent: "insult",
  }, 
  {
    text: "damn", 
    intent: "insult",
  }, 
  {
    text: "damn you", 
    intent: "insult",
  }, 
  {
    text: "not working", 
    intent: "frustration",
  }, 
  {
    text: "not helping", 
    intent: "frustration",
  }, 
  {
    text: "this is not what I asked", 
    intent: "frustration",
  }, 
  {
    text: "this is not what I wanted", 
    intent: "frustration",
  }, 
  {
    text: "wrong", 
    intent: "frustration",
  }, 
  {
    text: "false", 
    intent: "frustration",
  }, 
  {
    text: "what is this", 
    intent: "frustration",
  }, 
  {
    text: "what is that", 
    intent: "frustration",
  }, 
  {
    text: "I didn't want this", 
    intent: "frustration",
  }, 
  {
    text: "I asked something different", 
    intent: "frustration",
  }, 
  {
    text: "not that", 
    intent: "frustration",
  }, 
  {
    text: "not this", 
    intent: "frustration",
  }, 
  {
    text: "you were not helpful", 
    intent: "frustration",
  }, 
  {
    text: "you were not useful", 
    intent: "frustration",
  }, 
  {
    text: "useless", 
    intent: "frustration",
  }, 
  {
    text: "inaccurate", 
    intent: "frustration",
  }, 
  {
    text: "not good", 
    intent: "frustration",
  }, 
  {
    text: "bad", 
    intent: "frustration",
  }, 
  {
    text: "terrible", 
    intent: "frustration",
  }, 
  {
    text: "mistake", 
    intent: "frustration",
  }, 
  {
    text: "this is not very accurate", 
    intent: "frustration",
  }, 
  {
    text: "this is inaccurate", 
    intent: "frustration",
  }, 
  {
    text: "this is not correct", 
    intent: "frustration",
  }, 
  {
    text: "bad ansver", 
    intent: "frustration",
  }          
]