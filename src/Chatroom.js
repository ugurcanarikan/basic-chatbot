import React from 'react';
import ReactDOM from 'react-dom';
import './App.css';

import Message from './Message.js';
import Axios from 'axios';

class Chatroom extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            chats: [],
            flow : {value: null, length: 0}
        };
        this.submitMessage = this.submitMessage.bind(this);
        this.handleUpload = this.handleUpload.bind(this);
        this.submitUpload = this.submitUpload.bind(this);
    }

    componentDidMount() {
        this.scrollToBot();
    }

    componentDidUpdate() {
        this.scrollToBot();
    }

    scrollToBot() {
        ReactDOM.findDOMNode(this.refs.chats).scrollTop = ReactDOM.findDOMNode(this.refs.chats).scrollHeight;
    }

    say(message, person){
        if(person === "user"){
            this.setState({
                chats: this.state.chats.concat([{                       // concatanate new message to the chat
                    username: person,
                    content: <p>{message}</p>,
                }]),
                flow: {value: this.state.flow.value, length: this.state.flow.length + 1}        
            }, () => {
                ReactDOM.findDOMNode(this.refs.msg).value = "";         // reset the message input
            });
        }
        else if(person === "bot"){
            this.setState({
                chats: this.state.chats.concat([{                       // concatanate new message to the chat
                    username: person,
                    content: <p>{message}</p>,
                }]),
            }, () => {
                ReactDOM.findDOMNode(this.refs.msg).value = "";         // reset the message input
            });
        }
    }

    async submitMessage(e) {
        e.preventDefault();
        const message = ReactDOM.findDOMNode(this.refs.msg).value;
        if(this.state.flow.value === null){
            await this.callFlowAPI(message);
        }
        await this.say(message, "user")
        this.respond(message);
    }

    /*async callFlowAPI(message){
        const res = await fetch('/flow/' + message);
        const body = await res.json();
        this.setState({
            flow: {value: body.flow, length: this.state.flow.length} 
        });
    }*/

    async callFlowAPI(message){
        await Axios.get('/flow/' + message).then(response => {
            this.setState({
                flow: {value: response.data.flow, length: this.state.flow.length} 
            });
        }).catch(err => {
            console.log(err);
        });
    }

    async callResponseAPI(message){
        const res = await fetch('/response/' + message + '&' + this.state.flow.value + '&' + this.state.flow.length);
        const body = await res.json();
        return body;
    } 

    async respond(message){
        Axios.get('/response/' + message + '&' + this.state.flow.value + '&' + this.state.flow.length).then(async response => {
            await this.say(response.data.response, "bot");
            if(response.data.endOfFlow === true){
                this.setState({
                    flow: {value: null, length: 0}
                });         
            }
        }).catch(err => {
            console.log(err);
        });
    }

    handleUpload(event){
        const file = event.target.files[0];
        let formData = new FormData();
        formData.append('file', file);
    }

    async submitUpload(e){
        e.preventDefault();
        const data = new FormData();
        try{
            console.log(this.uploadInput.files[0]);
            data.append('file', this.uploadInput.files[0]);
            data.append('name', this.uploadInput.files[0].name);
        }catch(err){
            await this.say("There was an error uploading the file, please try again", "bot");
            await this.say("You can view the detailed error in the console by pressing F12", "bot");
            console.log(err);
            return;
        }
        await this.say("I am starting my training now. Please wait", "bot");
        Axios.post('/uploadd/', data, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
            }).then(async res => {
                console.log(res);
                if(res.data.statusCode === 200){
                    this.say("I have completed my training", "bot");
                }
                else{
                    await this.say("I could not complete my training due to an error on NLU." + 
                    " To see a list of errors, open console by pressing F12", "bot");
                }
            }).catch(async err => {
                await this.say("I could not complete my training." + 
                    " To see a list of errors, open console by pressing F12", "bot");
                console.log("Error uploading the file " + err);
            });
        
    }

    render() {
        const { chats } = this.state;
        return (
            <div className="chatroom">
                <h3>Chatbot</h3>
                <ul className="chats" ref="chats">
                    {
                        chats.map((chat) => 
                            <Message chat={chat}/>
                        )
                    }
                </ul>
                <form className="input" onSubmit={(e) => this.submitMessage(e)}>
                    <input type="text" ref="msg" />
                    <input type="submit" value="Submit" />
                </form>
                <form className="input" onSubmit={e => this.submitUpload(e)}>
                    <input ref={(ref) => { this.uploadInput = ref; }} type="file" name="file" />
                    <input type="submit" value="Upload" />
                </form>
            </div>
        );
    }
}

export default Chatroom;