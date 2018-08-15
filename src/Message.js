import React from 'react';

const Message = ({chat}) => (
    <li className={`chat ${chat.username !== "bot" ? "right" : "left"}`}>
        {chat.content}
    </li>
);

export default Message;