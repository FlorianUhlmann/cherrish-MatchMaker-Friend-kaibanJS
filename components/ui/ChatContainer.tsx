import React from "react";

type ChatContainerProps = React.HTMLAttributes<HTMLDivElement>;

export const ChatContainer = React.forwardRef<HTMLDivElement, ChatContainerProps>(
  function ChatContainer({ children, className = "", ...props }, ref) {
    return (
      <div ref={ref} className={`chat-window ${className}`} {...props}>
        {children}
      </div>
    );
  }
);
