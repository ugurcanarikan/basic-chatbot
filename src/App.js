import React, { Component } from 'react';
import './App.css';

import Chatroom from './Chatroom.js';

class App extends Component {
  render() {
    return (
      <div className="App">
        <p><Chatroom /></p>
      </div>
    );
  }
}

export default App;
