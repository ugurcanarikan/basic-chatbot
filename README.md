# Simple Chatbot
A simple chatbot to communicate on various topics and to be trained.

* Front-end was written with ```React.js``` and listens port:3000
* Back-end was written with ```Node.js v8.11.3``` and listes port:3001
* Simple NLU unit listens port:5000 to evaluate flow of the incomming messages. NLU used in the project [rasa_nlu](https://github.com/RasaHQ/rasa_nlu) 
* For the training of the bot with different models, intents are stored in NoSQL database. ```MongoDB``` is used as database management program. 

## Installation
Clone the repository and run 
```javascript
npm install
```
to install dependencies.

## Running
In order to run the project, you will need rasa_nlu to be running in the localhost:5000. You also need to have a project and a model for nlu Instructions to install and run rasa_nlu can be found at their own [github](https://github.com/RasaHQ/rasa_nlu) or [web page](http://rasa.com/docs/nlu/). Note that you don't need to train rasa_nlu, as it will be done through chatbot itself.

After installing and running rasa_nlu, modify projectName and modelName variables inside 
```server.js``` file as they will be used as default project and model at the program start.

Also, a database to store intents is also required. [mlab](https://mlab.com) was the cloud program used during the development and is encouraged for the further usage. In the database you specified, you will need a ```projects``` collection which will hold different projects you upload. In this collection, default schema is
```
{
    _id: {$oid : id},
    projectName: projectName,
    modelName: modelName,
    dbURL: dbURL,
    dbName: dbName,
    collectionName: collectionName,
    desctiption: description
}
```
Project name is the name of the rasa project, modelName is the name of the rasa model and the rest is url of your database, name of your database, name of the collection that the intents to train rasa_nlu will be taken from and description of the project. You also need to modify those inside server.js as default parameters.

After installing and running rasa_nlu and setting up a database, you are ready to run the chatbot.

Inside the project folder, run the command 
```
npm run dev
```
in order to run the chatbot. This command will run both server and client side concurrently. Server side will be on port 3001 while server side will be on port 3000.

The chatbot will be initially trained and run with the intents from the database you specified. You may now train your bot or add new projects. Typing ```*``` or ```*help``` on the chatbot, you may get more help.