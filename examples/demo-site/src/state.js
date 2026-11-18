import { createContext, useContext } from 'react';

// Playground state lives above <UiView>, so switching the document language
// (a new Links Notation source, hence a new store) keeps the user's edits.
export const DemoContext = createContext(null);

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) {
    throw new Error('DemoContext is missing');
  }
  return value;
}
