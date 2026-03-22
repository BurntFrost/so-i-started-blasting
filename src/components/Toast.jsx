import { useEffect } from "react";

export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;

  return <div className="toast">{message}</div>;
}
