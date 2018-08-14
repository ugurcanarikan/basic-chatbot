import React from 'react';

const Message = ({chat, user}) => (
    <li className={`chat ${user === chat.username ? "right" : "left"}`}>
        {chat.content}
    </li>
);

export default Message;