import React from "react";

type ChatBubbleProps = {
  isUser: boolean;
  message: string;
};

export const ChatBubble = ({ isUser, message }: ChatBubbleProps) => (
  <div
    className={`bubble ${isUser ? "user" : "assistant"} ${
      isUser ? "ml-auto" : "mr-auto"
    }`}
  >
    {message}
  </div>
);
