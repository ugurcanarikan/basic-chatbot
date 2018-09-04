const express = require('express');
const path = require('path');
const rp = require('request-promise');
const fs = require('fs');
const request = require('request');

const readXlsxFile = require('../node_modules/read-excel-file/node');
const multer  = require('multer');
const UPLOAD_DESTINATION = __dirname + "/uploads/";
const OLD_TRAINING_PATH = __dirname + "/rasa/default_training.yml";
var upload = multer({ dest: UPLOAD_DESTINATION });

const app = express();
const port = process.env.port || 3001;


app.listen(port, async () => {
    console.log("Starting initial training");
    await initialTraining();
    console.log("Server listenning on port " + port);
});

app.get('/response/*', async (req, res) => {
    var paramArray = req.params[0].split('&');
    var message = paramArray[0];
    var flowValue = paramArray[1];
    var flowLenght = parseInt(paramArray[2]);
    var endOfFlow = true;
    console.log("incoming message : " + message);
    console.log("incoming flow value : " + flowValue);
    console.log("incoming flow length : " + flowLenght);
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
    console.log("incoming message : " + message);
    var flow = {value : null};
    await getFlow(message, flow);
    res.send({flow : flow.value});
})

app.post('/upload/',upload.single('file'), async (req, res) => {
    var file = {};
    await readExcel(file, UPLOAD_DESTINATION + "/" + req.file.filename).then(async () => {
        await train(file).then(response => res.send(response));
    })
})

/**
 * Trains the nlu unit given the contents of the file
 * @param {*} file contents that the nlu will be trained with
 */
async function train(file){
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
            var newIntent = "      {\n  " + "        \"text\": \"" + file[i].q + "\",\n  " + "        \"intent\": \"" + file[i].a + "\",\n  " + "        \"entities\": []\n        },\n  ";
            fileContents = fileContents + newIntent;
            fs.appendFile(OLD_TRAINING_PATH, newIntent, err => {
                if(err) console.error(err);
            });
        };
        fileContents = fileContents + "    ]\n  \}\n}";
        fileContents = encode_utf8(fileContents);
        return {text: fileContents};
    }).then(async s => {
        await trainNLU(s).then(response => {
            if(response.statusCode === 200){
                console.log("SUCCESS INITIAL TRAINING");
            }
            else{
                console.error("FAILED INITIAL TRAINING");
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
            if(err) reject(err);
            else{
                resolve(data);
            }
        });
    }).then(data => {
        fileContents = fileContents + data;
        fileContents = fileContents + "    ]\n  \}\n}";
        fileContents = encode_utf8(fileContents);
        return {text: fileContents};
    }).then(async s => {
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
        url: 'http://localhost:5000/train?project=current',
        qs: { project: 'current' },
        headers: 
        { 
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/x-yml' },
        body: file.text,
        resolveWithFullResponse: true
    };
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
    var dataString = "{\"q\": \"" + message + "\", \"project\": \"current\"}";

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
 * output: [{questions:q1, answers:a1}, {questions:q2, answers:a2}]
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
                file[i - 2][rows[1][j]] = rows[i][j];
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
            console.log('received data: ' + data);
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.write(data);
            response.end();
        } else {
            console.error(err);
        }
    });
}
