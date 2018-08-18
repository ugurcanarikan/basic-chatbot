const express = require('express');
const path = require('path');
const rp = require('request-promise');
const fs = require('fs');

const readXlsxFile = require('../node_modules/read-excel-file/node');
const multer  = require('multer');
const UPLOAD_DESTINATION = "uploads/";
const TRAINING_DESTINATION = "training/";
const ABSOLUTE_TRAINING_PATH = "/home/stajyer/Documents/react-chatapp-master/src/training/train.yml";
var upload = multer({ dest: UPLOAD_DESTINATION });

const app = express();
const port = process.env.port || 3001;



app.listen(port, () => console.log("Server listenning on port " + port))

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
        await formTrainFile(file);
        await trainNLU(file).then(response => {
            res.send({statusCode: response.response.statusCode, statusMessage: response.response.statusMessage});
        }).catch(err => {
            console.log(err);
            res.send(err);
        });
    }).catch(err => {
        console.log(err);
        res.send({statusCode: err.response.statusCode, statusMessage: err.response.statusMessage});
    });
})

function formTrainFile(file){
    var fileContents = "language: \"en\"\npipeline: \"spacy_sklearn\"\n\n" ;
    fileContents = fileContents + "data: {\n\t\"rasa_nlu_data\": {\n\t\t\"common_examples\": [\n\n"
    var length = Object.keys(file).length;
    for(i = 0; i < length; i++){
        fileContents = fileContents + "\t\t\t{\n";
        fileContents = fileContents + "\t\t\t\t\"text\": \"" + file[i].q + "\",\n";
        fileContents = fileContents + "\t\t\t\t\"intent\": \"" + file[i].a + "\",\n";
        fileContents = fileContents + "\t\t\t\t\"entities\": []\n\t\t\t},\n";
    }
    fileContents = fileContents + "\t\t]\n\t\}\n}";
    fs.writeFile(TRAINING_DESTINATION + "train.yml", fileContents, function(err){
        if(err){
            console.log("Error creating the training file");
            console.log(err);
        }
    });   
}

async function trainNLU(){
    var url = "http://localhost:5000/train?project=default&d=" + ABSOLUTE_TRAINING_PATH;
    var options = {
        method: 'POST',
        url: url,
        headers: {'Content-Type': 'application/x-yml'},
        encoding: 'utf8', 
        //Accept: 'application/json',
        //json: true // Automatically stringifies the body to JSON
    };
    console.log("training NLU unit at " + url);

    await rp(options).then(body => {
        var b = JSON.parse(body);
        return b;
    }).catch(err => {
        console.log("Error while training NLU");
        console.log(err);
    });
}

async function getFlow(message, flow){
    console.log("Determining the flow of the message");
    await askNLU(message, flow);
    console.log("Determined Flow : " + flow.value);
}

function getCityUrl(message) {
    var city = message.charAt(0).toUpperCase() + message.slice(1);
    city = city.replace(/\s+/g, '');
    var url = 'http://api.openweathermap.org/data/2.5/weather?q=' + city +
        '&appid=' + 'd46ce5a0f44a100b614bde2f94a11c15';

    return url;
}

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
        console.log("Error getting the weather in the getWeather function in customActions.js")
        console.log(err);
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
        console.log(err);
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
        console.log(err);
    });
}

async function askNLU(message, flow) {
    var url = "http://localhost:5000/parse?q=" + message;
    console.log("Connecting to NLU unit at " + url);

    await rp(url).then(body => {
        var b = JSON.parse(body);
        return b;
    }).then(b => {
        if (b.intent.confidence >= 0.3) {
            flow.value = b.intent.name;
        }
    }).catch(err => {
        console.log(err);
    });
}

/**
 * Reads an excel file in the .xlsx format. File's location is given in the function
 * Excel file is then transformed to an array of objects
 * Excel file is assumed to have below format:
 * row1:    [file header]
 * row2:    [row of field names]
 * row3:    [rows of fields]
 * Example:
 *          faq
 *          questions | answers
 *          q1        | a1
 *          q2        | a2  
 */
async function readExcel(file, location){
    await readXlsxFile(location).then((rows) => {
        var numOfFields = rows[1].length;
        for(let i = 0; i < rows.length - 1; i++){
            file[i] = {};
        }
        for(let i = 1; i < rows.length; i++){
            for(let j = 0; j < numOfFields; j++){
                file[i - 1][rows[1][j]] = rows[i][j];
            }
        }
        }).catch(err => {
            console.log("Error reading excel file: " + err);
    })
}

//TODO read from an excel file and train the NLU with Q/As
app.get('/excel', async (req, res)=>{
    var file = {};
    var location = "/home/stajyer/Documents/faq2.xlsx";
    await readExcel(file, location);
    console.log(file);
})
