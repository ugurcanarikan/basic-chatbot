const express = require('express');
const path = require('path');
const rp = require('request-promise');

const app = express();
const port = process.env.port || 3001;



app.listen(port, () => console.log("Server listenning on port " + port))

app.get('/response/*', async (req, res) => {
    var paramArray = req.params[0].split('&');
    var message = paramArray[0];
    var flowValue = paramArray[1];
    var flowLenght = parseInt(paramArray[2]);
    var endOfFLow = true;
    console.log("incoming message : " + message);
    console.log("incoming flow value : " + flowValue);
    console.log("incoming flow length : " + flowLenght);
    var flow = {value : ""};
    await getFlow(message, flow);
    var response = "";
    if(flow.value === "currency"){
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
    else if(flow.value === "weather"){
        if(flowLenght === 1){
            response = "Which city would you like to know?";
            endOfFLow = false;
        }
        else if(flowLenght === 2){
            var url = await getCityUrl(message);
            var weather = {city: message, code: 0};
            await getWeather(url, message);
            if(weather.code === 200){
                response = "Weather in " + state.weather.city + " is " + state.weather.main + " with " +
                    state.weather.description + ". \nTemperature is " + state.weather.temp + 
                    "Celcius. \n" + "Humidity is " + state.weather.humidity + " % . \n" + 
                    "Pressure is " + state.weather.pressure + " bar";
            }
            else{
                response = "Error while getting the weather for " + message;
            }
        }
    }
    console.log("Determined response: " + response);
    res.send({response : response, endOfFLow: endOfFLow.toString()});
})

app.get('/flow/*', async (req, res) => {
    var message = req.params[0];
    console.log("incoming message : " + message);
    var flow = {value : ""};
    await getFlow(message, flow);
    res.send({flow : flow.value});
})

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
    await rp(url).then(body => {
        var b = JSON.parse(body);
        console.log(b);
        weather.code = 200;
        weather.main = b.weather[0].main;
        weather.description = b.weather[0].description;
        weather.temp = b.main.temp - 273.15;
        weather.humidity = b.main.humidity;
        weather.pressure = b.main.pressure;
        return weather;
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
        console.log(b);
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
        console.log(b);
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
        console.log(b);
        return b;
    }).then(b => {
        if (b.intent.confidence >= 0.3) {
            flow.value = b.intent.name;
        }
        return flow;
    }).catch(err => {
        console.log(err);
    });
}
