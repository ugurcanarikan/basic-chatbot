import React from 'react';
import ReactDOM from 'react-dom';
import './App.css';

import Message from './Message.js';

class Chatroom extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            chats: [],
            flow : {value: null, length: 0}
        };

        this.submitMessage = this.submitMessage.bind(this);
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

    async submitMessage(e) {
        e.preventDefault();
        const message = ReactDOM.findDOMNode(this.refs.msg).value;
        if(this.state.flow.value === null){
            await this.callFlowAPI(message);
        }
        await this.setState({
            chats: this.state.chats.concat([{                       // concatanate new message to the chat
                username: "user",
                content: <p>{message}</p>,
            }]),
            flow: {value: this.state.flow.value, length: this.state.flow.length + 1}
        }, () => {
            ReactDOM.findDOMNode(this.refs.msg).value = "";         // reset the message input
        });
        this.respond(message);
    }

    async callFlowAPI(message){
        const res = await fetch('/flow/' + message);
        const body = await res.json();
        this.setState({
            flow: {value: body.flow, length: this.state.flow.length} 
        });
    }

    async callResponseAPI(message){
        const res = await fetch('/response/' + message + '&' + this.state.flow.value + '&' + this.state.flow.length);
        const body = await res.json();
        return body;
    } 

    async respond(message){
        this.callResponseAPI(message)
        .then(body => {
            this.setState({
                chats: this.state.chats.concat([{                       // concatanate new message to the chat
                    username: "bot",
                    content: <p>{body.response}</p>,
                }])
            }, () => {
                ReactDOM.findDOMNode(this.refs.msg).value = "";         // reset the message input
            });
            if(body.endOfFlow === true){
                this.setState({
                    flow: {value: null, length: 0}
                });         
            }
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
            </div>
        );
    }
}

export default Chatroom;