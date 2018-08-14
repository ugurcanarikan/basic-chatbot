import React from 'react';
import ReactDOM from 'react-dom';
import './App.css';

import Message from './Message.js';

class Chatroom extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            chats: []
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

    submitMessage(e) {
        e.preventDefault();
        const message = ReactDOM.findDOMNode(this.refs.msg).value;
        this.respond(message);
        
        this.setState({
            chats: this.state.chats.concat([{                       // concatanate new message to the chat
                username: "You",
                content: <p>{message}</p>,
            }])
        }, () => {
            ReactDOM.findDOMNode(this.refs.msg).value = "";         // reset the message input
        });
    }

    async callAPI(message){
        const res = await fetch('/' + message);
        const body = await res.json();
        return body.response;
    } 

    async respond(message){
        this.callAPI(message)
        .then(res => {
            console.log(res);
            this.setState({
                chats: this.state.chats.concat([{                       // concatanate new message to the chat
                    username: "You",
                    content: <p>{res}</p>,
                }])
            }, () => {
                ReactDOM.findDOMNode(this.refs.msg).value = "";         // reset the message input
            });
        });
    }

    render() {
        const { chats } = this.state;

        return (
            <div className="chatroom">
                <h3>Cahtbot</h3>
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