const express = require('express');
const path = require('path');
const rp = require('request-promise');

const app = express();
const port = process.env.port || 3001;



app.listen(port, () => console.log("Server listenning on port " + port))

app.get('/*', async (req, res) => {
    var message = req.params[0];
    console.log(req.params);
    console.log("incoming message : " + message);
    var category = {value : ""};
    await askNLU(message, category);
    console.log("category : " + category.value);
    var response = "";
    if(category.value === "currency"){
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
    console.log(response);
    res.send({response : response});
})

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


async function askNLU(message, category) {
    var url = "http://localhost:5000/parse?q=" + message;
    console.log("Connecting to NLU unit at " + url);

    await rp(url).then(body => {
        var b = JSON.parse(body);
        console.log(b);
        return b;
    }).then(b => {
        if (b.intent.confidence >= 0.3) {
            category.value = b.intent.name;
        }
        return category;
    }).catch(err => {
        console.log(err);
    });
}